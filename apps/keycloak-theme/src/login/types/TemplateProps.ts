import type { TemplateProps as BaseTemplateProps } from "keycloakify/login/TemplateProps";
import type { ReactNode } from "react";

export interface ExtendedTemplateProps<KcContext, I18n>
  extends BaseTemplateProps<KcContext, I18n> {
  headerSubNode?: ReactNode;
}
