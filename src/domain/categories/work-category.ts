export type WorkCategory = {
  id: string;
  name: string;
  color: string;
  hidden: boolean;
  archived: boolean;
  position: number;
};

export const DEFAULT_CATEGORIES = [{ id: "punch", name: "打刻", color: "#168ab5" }];
