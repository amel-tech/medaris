import type React from 'react'
import type { PageProps as BasePageProps } from 'keycloakify/login/pages/PageProps'
import type { ExtendedTemplateProps } from './TemplateProps'

export interface ExtendedPageProps<KcContext, I18n>
  extends Omit<BasePageProps<KcContext, I18n>, 'Template'> {
  Template: (
    props: ExtendedTemplateProps<KcContext, I18n>,
  ) => React.JSX.Element | null
}
