import * as React from 'react';

export interface FieldProps {
  label?: React.ReactNode;
  help?: React.ReactNode;
  /** present means the field is in error: shown in place of help, and aria-invalid on the control */
  error?: React.ReactNode;
  /** native required and aria-required on the control; the asterisk is decorative */
  required?: boolean;
  /** one control: Input, Textarea, Select, or a Checkbox under a help or error line */
  children: React.ReactNode;
  className?: string;
}
export declare function Field(props: FieldProps): JSX.Element;
