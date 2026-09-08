// excel.service.ts

import { Injectable, StreamableFile } from "@nestjs/common";
import { Workbook, Worksheet } from "exceljs";
import { Readable, Writable } from "stream";
import {
  ExcelColumnConfig,
  ExcelSheetConfig,
} from "./interfaces/excel-column.interface";

/**
 * The characters a spreadsheet reads as "this cell is a formula" when it opens
 * a generated file. `=` and `+` start a formula outright, `-` starts a negated
 * one, `@` is Excel's legacy function-call sigil, and a leading tab or CR is
 * stripped by the parser before any of the above is looked at — so `\t=cmd|...`
 * lands as a formula too.
 */
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

/**
 * MDRS-36. Neutralize spreadsheet formula injection in an exported cell.
 *
 * Export rows carry text other users authored (a deck export streams every
 * card in the deck), and the csv branch writes that text out verbatim. A card
 * whose front begins with one of {@link FORMULA_TRIGGERS} is then evaluated as
 * a formula by Excel or LibreOffice on the downloader's machine — the standard
 * route to `=HYPERLINK(...)` exfiltration or DDE execution.
 *
 * Prefixing a single quote is the escape both applications understand: the
 * cell is forced to text. When a person types that quote directly into the
 * grid it becomes Excel's `quotePrefix` cell attribute — hidden, not part of
 * the displayed value — but exceljs writes a plain string here, so the quote
 * is literal text in the file and visible when it's opened. {@link
 * denormalizeFormula} strips it back out on import, so the round trip through
 * `parseSheet` is exact. Only strings are touched — numbers and dates pass
 * through untouched so spreadsheet arithmetic still works on them.
 *
 * Pure by design, and exported, so it can be asserted on directly.
 */
export function neutralizeFormula<T>(value: T): T | string {
  if (typeof value !== "string") return value;
  return FORMULA_TRIGGERS.test(value) ? `'${value}` : value;
}

/**
 * MDRS-36. The inverse of {@link neutralizeFormula}, applied in `parseSheet`.
 *
 * Without this, the escape doesn't round-trip: a legitimate card that starts
 * with `-` or `+` (a suffix drill, say) comes back from import with a
 * permanent leading `'` baked into its stored content, and a card already at
 * a field's length bound gets pushed over it by the extra character.
 *
 * Stripping every leading apostrophe is not the inverse, though — that also
 * eats apostrophes {@link neutralizeFormula} never added. This app's own
 * decks carry transliterated hamza/ayn (`'ayn`, `'Umar`), which `'` does not
 * appear in {@link FORMULA_TRIGGERS}, so `neutralizeFormula` leaves them
 * alone; an unconditional strip would still remove the leading `'` on
 * import, losing a character every round trip. So this only unwraps when
 * what follows the apostrophe is itself a trigger — the one shape
 * `neutralizeFormula` can actually produce.
 */
export function denormalizeFormula<T>(value: T): T | string {
  if (typeof value !== "string" || !value.startsWith("'")) return value;
  const rest = value.slice(1);
  return FORMULA_TRIGGERS.test(rest) ? rest : value;
}

@Injectable()
export class ExcelService {
  async generateSample<T extends Record<string, any>>(
    config: ExcelSheetConfig<T>,
    format: "xlsx" | "csv" = "xlsx"
  ): Promise<StreamableFile> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(config.sheetName || "Sheet1");
    sheet.columns = this.buildColumns(config);

    const rows = this.buildRows(config.examples ?? [], config);
    if (rows.length > 0) sheet.addRows(rows);

    this.styleHeader(sheet);
    const buffer = await this.toBuffer(workbook, format);

    return new StreamableFile(buffer, {
      type: this.contentType(format),
      disposition: `attachment; filename=sample.${format}`,
    });
  }

  async exportData<T extends Record<string, any>>(
    data: T[],
    config: ExcelSheetConfig<T>,
    filename: string,
    format: "xlsx" | "csv" = "xlsx"
  ): Promise<StreamableFile> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(config.sheetName || "Sheet1");
    sheet.columns = this.buildColumns(config);

    const rows = this.buildRows(data, config);
    if (rows.length > 0) sheet.addRows(rows);

    this.styleHeader(sheet);
    const buffer = await this.toBuffer(workbook, format);

    const safeFilename = filename.replace(/[^a-z0-9_-]/gi, "_");
    return new StreamableFile(buffer, {
      type: this.contentType(format),
      disposition: `attachment; filename=${safeFilename}.${format}`,
    });
  }

  private buildColumns<T>(config: ExcelSheetConfig<T>) {
    return config.columns.map((col) => ({
      header: col.header,
      key: col.key as string,
      width: col.width || 20,
    }));
  }

  /**
   * Shared by `generateSample` and `exportData` — both write the same
   * `{ [column.key]: neutralizeFormula(...) }` row shape, and before this
   * extraction each had its own copy, which is how the export-side escape
   * ended up applied at two independent call sites for one PR (MDRS-36).
   */
  private buildRows<T>(items: T[], config: ExcelSheetConfig<T>) {
    return items.map((item) => {
      const row: Record<string, any> = {};
      config.columns.forEach((col) => {
        const value = item[col.key];
        row[col.key as string] = neutralizeFormula(
          col.format ? col.format(value) : value
        );
      });
      return row;
    });
  }

  private async toBuffer(
    workbook: Workbook,
    format: "xlsx" | "csv"
  ): Promise<Buffer> {
    if (format === "xlsx") {
      return Buffer.from(await workbook.xlsx.writeBuffer());
    }

    const buffers: Buffer[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
    });

    const finished = new Promise<void>((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    await workbook.csv.write(stream);
    if (!stream.writableEnded) {
      stream.end();
    }
    await finished;
    return Buffer.concat(buffers);
  }

  private contentType(format: "xlsx" | "csv"): string {
    return format === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "text/csv";
  }

  async parseFile<T extends Record<string, any>>(
    buffer: Buffer,
    config: ExcelSheetConfig<T>,
    format: "xlsx" | "csv" = "xlsx"
  ): Promise<T[]> {
    const workbook = new Workbook();

    if (format === "xlsx") {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } else {
      const stream = Readable.from(buffer);
      await workbook.csv.read(stream);
    }

    if (!workbook.worksheets || workbook.worksheets.length === 0) {
      throw new Error(
        "The uploaded Excel file contains no worksheets to parse."
      );
    }
    const sheet = workbook.worksheets[0];
    return this.parseSheet<T>(sheet, config);
  }

  private parseSheet<T extends Record<string, any>>(
    sheet: Worksheet,
    config: ExcelSheetConfig<T>
  ): T[] {
    const data: T[] = [];
    const headerMap = new Map<number, ExcelColumnConfig<T>>();

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      const headerValue = String(cell.value).trim();
      const columnConfig = config.columns.find(
        (col) => col.header.toLowerCase() === headerValue.toLowerCase()
      );
      if (columnConfig) {
        headerMap.set(colNumber, columnConfig);
      }
    });

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const rowData = {} as T;
      let hasData = false;

      headerMap.forEach((columnConfig, colNumber) => {
        const cell = row.getCell(colNumber);
        let value = cell.value;

        if (value !== null && value !== undefined && value !== "") {
          hasData = true;

          value = denormalizeFormula(value);
          if (columnConfig.transform) {
            value = columnConfig.transform(value);
          }

          (rowData as any)[columnConfig.key] = value;
        }
      });

      if (hasData) {
        data.push(rowData);
      }
    });

    return data;
  }

  private styleHeader(sheet: Worksheet): void {
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
  }

  detectFormat(mimetype: string, filename?: string): "xlsx" | "csv" {
    const csvMimeTypes = ["text/csv", "text/plain", "application/octet-stream"];
    if (csvMimeTypes.includes(mimetype)) {
      const ext = filename?.split(".").pop()?.toLowerCase();
      return ext === "xlsx" ? "xlsx" : "csv";
    }
    return "xlsx";
  }
}
