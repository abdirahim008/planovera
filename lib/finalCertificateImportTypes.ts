import type {
  PaymentCertificate,
  Program,
  ProgressReport,
  Project,
  SavedBOQ,
  SavedWorkPlan,
} from "./supabase";

export const FINAL_CERTIFICATE_IMPORT_ID = "final-certificate-test";
export const FINAL_CERTIFICATE_PROGRAM_ID = "final-cert-test-program";
export const FINAL_CERTIFICATE_ID_PREFIX = "final-cert-test-";

export type FinalCertificateImportPreview = {
  importId: typeof FINAL_CERTIFICATE_IMPORT_ID;
  importedAt: string;
  projectName: string;
  contractNumber: string;
  contractorName: string;
  boqFileName: string;
  ipcFileName: string;
  takingOverFileName: string;
  revisedContractSum: number;
  boqGrandTotal: number;
  lastIpcThisCertificate: number;
  lastIpcNetDue: number;
  retentionReleaseAmount: number;
  finalNetPayable: number;
  warnings: string[];
};

export type FinalCertificateImportPayload = {
  importId: typeof FINAL_CERTIFICATE_IMPORT_ID;
  importedAt: string;
  preview: FinalCertificateImportPreview;
  programs: Program[];
  projects: Project[];
  savedBOQs: SavedBOQ[];
  savedWorkPlans: SavedWorkPlan[];
  progressReports: ProgressReport[];
  certificates: PaymentCertificate[];
};
