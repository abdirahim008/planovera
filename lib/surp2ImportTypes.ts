import type {
  PaymentCertificate,
  Program,
  Project,
  ProgressReport,
  SavedBOQ,
  SavedWorkPlan,
} from "./supabase";

export const SURP2_IMPORT_ID = "surp2-mogadishu";
export const SURP2_PROGRAM_ID = "surp2-program-mogadishu";

export type Surp2ImportPreviewPackage = {
  packageNumber: number;
  projectName: string;
  boqFileName: string;
  reportFileName: string;
  boqTotal: number;
  reportContractSum: number;
  variance: number;
  contractorName: string;
  plannedProgress: number;
  actualProgress: number;
  warnings: string[];
};

export type Surp2ImportPreview = {
  importId: typeof SURP2_IMPORT_ID;
  importedAt: string;
  programName: string;
  packageCount: number;
  totalBoqValue: number;
  warningCount: number;
  packages: Surp2ImportPreviewPackage[];
};

export type Surp2ImportPayload = {
  importId: typeof SURP2_IMPORT_ID;
  importedAt: string;
  preview: Surp2ImportPreview;
  programs: Program[];
  projects: Project[];
  savedBOQs: SavedBOQ[];
  savedWorkPlans: SavedWorkPlan[];
  progressReports: ProgressReport[];
  certificates: PaymentCertificate[];
};
