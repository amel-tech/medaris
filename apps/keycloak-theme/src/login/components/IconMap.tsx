import {
  FacebookLogoIcon,
  GithubLogoIcon,
  GitlabLogoIcon,
  GoogleLogoIcon,
  type Icon,
  type IconProps,
  InstagramLogoIcon,
  LinkedinLogoIcon,
  PaypalLogoIcon,
  StackOverflowLogoIcon,
  TwitterLogoIcon,
} from "@medaris/icons";
import type React from "react";

type IconMapProps = IconProps & {
  alias: string;
};

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
};

export const IconMap = (props: IconMapProps): React.JSX.Element | null => {
  const { alias, ...iconProps } = props;
  const IconComponent = iconComponents[alias];

  return IconComponent ? <IconComponent {...iconProps} /> : null;
};
