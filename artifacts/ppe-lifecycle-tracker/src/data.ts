import sourceSnapshot from './data/sourceData.json';

export type AssignmentStatus = 'OK' | 'Faulty' | 'Missing' | 'NOK' | 'Due';

export type PPEAssignment = {
  item: string;
  id: string;
  quantity: number;
  purchaseDate: string;
  issueDate: string;
  inspectionDate: string;
  status: AssignmentStatus;
  reason: string;
};

export type Employee = {
  id: string;
  name: string;
  mobile: string;
  designation: string;
  skill: 'Electrical' | 'Electrical & WAH';
  subcenter: string;
  assignments: PPEAssignment[];
};

export type RuleSet = Record<'Electrical' | 'Electrical & WAH', string[]>;

export type Activity = {
  date: string;
  action: string;
  employee: string;
  item: string;
  subcenter: string;
  outcome: string;
};

export const DEFAULT_RULES: RuleSet = {
  Electrical: [
    'Helmet (Network Site)',
    'Safety Vest',
    'Insulated Rubber Gloves',
    'Safety Shoe',
    'Loading Gloves',
    'Life Jacket',
    'Headlamp',
    'Raincoat',
    'Knee High Safety Boot',
    'Eye Goggles',
  ],
  'Electrical & WAH': [
    'Helmet (WAH)',
    'Safety Vest',
    'Insulated Rubber Gloves',
    'Safety Shoe',
    'Loading Gloves',
    'Full Body Harness',
    'Shock Absorber Lanyard',
    'Y Positioning Lanyard',
    'Carabiner',
    'Hand Gloves (WAH)',
    'Life Jacket',
    'Headlamp',
    'Raincoat',
    'Knee High Safety Boot',
    'Eye Goggles',
  ],
};

type SourceAssignment = {
  item: string;
  id: string;
  quantity: number;
  purchaseDate: string;
  issueDate: string;
  inspectionDate: string;
  status: string;
};

type SourceEmployee = {
  id: number;
  name: string;
  mobile: string;
  designation: string;
  skill: string;
  subcenter: string;
  ppe: Record<string, SourceAssignment>;
};

type SourceData = {
  employees: SourceEmployee[];
  activity: Array<{
    kind: string;
    employeeId: number;
    employee: string;
    item: string;
    ppeId: string;
    date: string;
    subcenter: string;
    reason: string;
    destination: string;
  }>;
};

const sourceData = sourceSnapshot as SourceData;

const itemKeyByLabel: Record<string, string> = {
  'Helmet (Network Site)': 'helmetNetwork',
  'Helmet (WAH)': 'helmetWah',
  'Safety Vest': 'safetyVest',
  'Insulated Rubber Gloves': 'insulatedRubberGloves',
  'Safety Shoe': 'safetyShoe',
  'Loading Gloves': 'loadingGloves',
  'Full Body Harness': 'fullBodyHarness',
  'Shock Absorber Lanyard': 'shockAbsorberLanyard',
  'Y Positioning Lanyard': 'yPositioningLanyard',
  Carabiner: 'carabiner',
  'Hand Gloves (WAH)': 'handGlovesWah',
  'Life Jacket': 'lifeJacket',
  Headlamp: 'headlamp',
  Raincoat: 'raincoat',
  'Knee High Safety Boot': 'kneeHighSafetyBoot',
  'Eye Goggles': 'eyeGoggles',
};

function normalizeStatus(value: string, quantity: number): AssignmentStatus {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'good' || normalized === 'ok') {
    return quantity > 0 ? 'OK' : 'Missing';
  }
  if (normalized === 'faulty') return 'Faulty';
  if (normalized === 'nok') return 'NOK';
  if (normalized === 'due') return 'Due';
  return 'Missing';
}

function toAssignment(
  item: string,
  source: SourceAssignment | undefined,
): PPEAssignment {
  const assignment = source ?? {
    item,
    id: '',
    quantity: 0,
    purchaseDate: '',
    issueDate: '',
    inspectionDate: '',
    status: '',
  };
  const missingSource = !source || assignment.quantity <= 0;
  return {
    item,
    id: assignment.id,
    quantity: assignment.quantity,
    purchaseDate: assignment.purchaseDate,
    issueDate: assignment.issueDate,
    inspectionDate: assignment.inspectionDate,
    status: normalizeStatus(assignment.status, assignment.quantity),
    reason: missingSource
      ? 'Not recorded in source workbook'
      : assignment.status.trim().toLowerCase() === 'faulty' ||
          assignment.status.trim().toLowerCase() === 'nok'
        ? 'Faulty / NOK at inspection'
        : '',
  };
}

export const SOURCE_EMPLOYEES: Employee[] = sourceData.employees.map(
  (sourceEmployee) => {
    const skill: Employee['skill'] =
      sourceEmployee.skill === 'Electrical & WAH'
        ? 'Electrical & WAH'
        : 'Electrical';
    const requiredItems = DEFAULT_RULES[skill];
    return {
      id: String(sourceEmployee.id),
      name: sourceEmployee.name,
      mobile: sourceEmployee.mobile,
      designation: sourceEmployee.designation,
      skill,
      subcenter: sourceEmployee.subcenter,
      assignments: requiredItems.map((item) =>
        toAssignment(item, sourceEmployee.ppe[itemKeyByLabel[item]]),
      ),
    };
  },
);

export const SOURCE_ACTIVITIES: Activity[] = sourceData.activity.map(
  (entry) => ({
    date: entry.date,
    action: entry.kind === 'Disposal' ? 'PPE disposed' : 'PPE transfer logged',
    employee: entry.employee,
    item: entry.item || 'Item not specified',
    subcenter: entry.subcenter,
    outcome:
      entry.kind === 'Disposal'
        ? entry.reason || 'Disposed'
        : entry.destination
          ? `Transferred to ${entry.destination}`
          : 'Transfer record opened',
  }),
);

export function ruleName(value: string) {
  return value.split('::')[0];
}

export function mergeRulesWithDefaults(stored: RuleSet | undefined): RuleSet {
  return {
    Electrical: [
      ...(stored?.Electrical ?? []),
      ...DEFAULT_RULES.Electrical.filter((item) => !(stored?.Electrical ?? []).some((rawItem) => ruleName(rawItem) === item)),
    ],
    'Electrical & WAH': [
      ...(stored?.['Electrical & WAH'] ?? []),
      ...DEFAULT_RULES['Electrical & WAH'].filter((item) => !(stored?.['Electrical & WAH'] ?? []).some((rawItem) => ruleName(rawItem) === item)),
    ],
  };
}

export function ensureRequiredAssignments(employees: Employee[], rules: RuleSet): Employee[] {
  return employees.map((employee) => {
    const requiredItems = rules[employee.skill].map(ruleName);
    const existingByItem = new Map(employee.assignments.map((assignment) => [assignment.item, assignment]));
    const assignments = requiredItems.map((item) => existingByItem.get(item) ?? toAssignment(item, undefined));
    const requiredSet = new Set(requiredItems);
    const legacyAssignments = employee.assignments.filter((assignment) => !requiredSet.has(assignment.item));
    return { ...employee, assignments: [...assignments, ...legacyAssignments] };
  });
}

export const cloneSource = () =>
  JSON.parse(JSON.stringify(SOURCE_EMPLOYEES)) as Employee[];