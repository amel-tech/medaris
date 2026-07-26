import {
  GoogleLogoIcon,
  FacebookLogoIcon,
  InstagramLogoIcon,
  TwitterLogoIcon,
  LinkedinLogoIcon,
  StackOverflowLogoIcon,
  GithubLogoIcon,
  GitlabLogoIcon,
  PaypalLogoIcon,
  Icon,
  IconProps,
} from '@madrasah/icons'

type IconMapProps = IconProps & {
  alias: string
}

const iconComponents: Record<string, Icon> = {
  google: GoogleLogoIcon,
  facebook: FacebookLogoIcon,
  instagram: InstagramLogoIcon,
  twitter: TwitterLogoIcon,
  linkedin: LinkedinLogoIcon,
  stackoverflow: StackOverflowLogoIcon,
  github: GithubLogoIcon,
  gitlab: GitlabLogoIcon,
  paypal: PaypalLogoIcon,
}

export const IconMap = (props: IconMapProps): JSX.Element | null => {
  const { alias, ...iconProps } = props
  const IconComponent = iconComponents[alias]

  return IconComponent ? <IconComponent {...iconProps} /> : null
}
