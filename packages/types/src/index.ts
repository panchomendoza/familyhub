// ══════════════════════════════════════════
//   USUARIOS Y AUTH
// ══════════════════════════════════════════

export interface User {
  id:        string;
  name:      string;
  email:     string;
  avatarUrl?: string;
  provider:  "email" | "google";
  createdAt: string;
}

export interface JwtPayload {
  sub:    string;
  name?:  string;
  email?: string;
  iat?:   number;
  exp?:   number;
}

export interface LoginInput {
  email:    string;
  password: string;
}

export interface RegisterInput {
  name:            string;
  email:           string;
  password:        string;
  confirmPassword: string;
}

// ══════════════════════════════════════════
//   FAMILIAS
// ══════════════════════════════════════════

export type DashboardId = "health" | "stock" | "expenses" | "tasks" | "vehicles";

export interface FamilyMember {
  id:              string;   // id del registro FamilyMember (para PATCH/DELETE)
  userId:          string;
  name:            string;
  email:           string;
  avatarUrl?:      string | null;
  role:            "admin" | "member";
  dashboardAccess: DashboardId[];
}

export interface Family {
  id:         string;
  name:       string;
  inviteCode: string;
  members:    FamilyMember[];
  createdAt:  string;
}

// ══════════════════════════════════════════
//   GASTOS
// ══════════════════════════════════════════

export interface ExpenseCategory {
  id:    string;
  label: string;
  icon:  string;
  color: string;
  order: number;
}

export interface Expense {
  id:                  string;
  monthId:             string;
  categoryId?:         string;
  name:                string;
  bank:                string;
  amount:              number;
  notes?:              string;
  installments:        number;
  currentInstallment:  number;
  paid:                boolean;
  installmentGroupId?: string;
  createdAt:           string;
}

export interface MonthlyExpenses {
  id:       string;
  familyId: string;
  year:     number;
  month:    number;
  income:   number;
  closed:   boolean;
  expenses: Expense[];
}

// ══════════════════════════════════════════
//   STOCK
// ══════════════════════════════════════════

export interface StockCategory {
  id:      string;
  label:   string;
  icon:    string;
  color:   string;
  order:   number;
}

export interface StockItem {
  id:          string;
  familyId:    string;
  categoryId:  string;
  name:        string;
  quantity:    number;
  minimum:     number;
  unit:        string;
  location?:   string;
  barcode?:    string;
  notes?:      string;
}

// ══════════════════════════════════════════
//   SALUD
// ══════════════════════════════════════════

export interface Child {
  id:            string;
  familyId:      string;
  name:          string;
  birthdate?:    string;
  gender?:       "M" | "F";
  birthplace?:   string;
  birthWeight?:  number;
  birthHeight?:  number;
  birthHeadCirc?: number;
  bloodType?:    string;
  notes?:        string;
}

export interface Control {
  id:       string;
  childId:  string;
  date:     string;
  doctor?:  string;
  center?:  string;
  weight?:  number;
  height?:  number;
  headCirc?: number;
  notes?:   string;
}

export interface Vaccine {
  id:      string;
  childId: string;
  date:    string;
  name:    string;
  dose?:   string;
  batch?:  string;
  notes?:  string;
}

export interface Visit {
  id:          string;
  childId:     string;
  date:        string;
  reason:      string;
  doctor?:     string;
  center?:     string;
  diagnosis?:  string;
  treatment?:  string;
  notes?:      string;
}

export interface Exam {
  id:          string;
  childId:     string;
  controlId?:  string;
  visitId?:    string;
  date:        string;
  type:        string;
  laboratory?: string;
  result?:     string;
}

export interface Attachment {
  id:         string;
  childId:    string;
  controlId?: string;
  visitId?:   string;
  name:       string;
  type:       "prescription" | "result" | "indication" | "other";
  date:       string;
  fileName:   string;
  fileSize:   number;
  mimeType:   string;
  notes?:     string;
  // URL firmada (pre-signed) para acceso — NO se persiste, se genera on-demand
  url?:       string;
}

// ══════════════════════════════════════════
//   API RESPONSES
// ══════════════════════════════════════════

export interface ApiError {
  error:    string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data:    T[];
  total:   number;
  page:    number;
  perPage: number;
}
