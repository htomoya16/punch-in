import { BRAND_COLOR } from "../../shared/colors/brand-color";

export type WorkCategory = {
  id: string;
  name: string;
  color: string;
  hidden: boolean;
  archived: boolean;
  position: number;
};

export const DEFAULT_CATEGORIES = [{ id: "punch", name: "打刻", color: BRAND_COLOR }];
