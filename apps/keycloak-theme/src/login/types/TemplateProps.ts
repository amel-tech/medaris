import type { ReactNode } from 'react'
import type { TemplateProps as BaseTemplateProps } from 'keycloakify/login/TemplateProps'

export interface ExtendedTemplateProps<KcContext, I18n>
  extends BaseTemplateProps<KcContext, I18n> {
  headerSubNode?: ReactNode
}
