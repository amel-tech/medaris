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
 * cell is forced to text, and the quote is not part of the displayed value, so
 * the card stays readable. Only strings are touched — numbers and dates pass
 * through untouched so spreadsheet arithmetic still works on them.
 *
 * Pure by design, and exported, so it can be asserted on directly.
 */
export function neutralizeFormula<T>(value: T): T | string {
  if (typeof value !== "string") return value;
  return FORMULA_TRIGGERS.test(value) ? `'${value}` : value;
}

@Injectable()
export class ExcelService {
  async generateSample<T extends Record<string, any>>(
    config: ExcelSheetConfig<T>,
    format: "xlsx" | "csv" = "xlsx"
  ): Promise<StreamableFile> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(config.sheetName || "Sheet1");

    sheet.columns = config.columns.map((col) => ({
      header: col.header,
      key: col.key as string,
      width: col.width || 20,
    }));

    if (config.examples && config.examples.length > 0) {
      const rows = config.examples.map((example) => {
        const row: Record<string, any> = {};
        config.columns.forEach((col) => {
          const value = example[col.key];
          row[col.key as string] = neutralizeFormula(
            col.format ? col.format(value) : value
          );
        });
        return row;
      });
      sheet.addRows(rows);
    }

    this.styleHeader(sheet);

    let buffer: Buffer;

    if (format === "xlsx") {
      buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    } else {
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
      buffer = Buffer.concat(buffers);
    }

    return new StreamableFile(buffer, {
      type:
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv",
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

    sheet.columns = config.columns.map((col) => ({
      header: col.header,
      key: col.key as string,
      width: col.width || 20,
    }));

    const rows = data.map((item) => {
      const row: Record<string, any> = {};
      config.columns.forEach((col) => {
        const value = item[col.key];
        row[col.key as string] = neutralizeFormula(
          col.format ? col.format(value) : value
        );
      });
      return row;
    });
    if (rows.length > 0) sheet.addRows(rows);

    this.styleHeader(sheet);

    let buffer: Buffer;

    if (format === "xlsx") {
      buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    } else {
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
      if (!stream.writableEnded) stream.end();
      await finished;
      buffer = Buffer.concat(buffers);
    }

    const safeFilename = filename.replace(/[^a-z0-9_-]/gi, "_");
    return new StreamableFile(buffer, {
      type:
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv",
      disposition: `attachment; filename=${safeFilename}.${format}`,
    });
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
