export const typeDefs = /* GraphQL */ `
  type Me {
    id: ID!
    role: String!
  }

  type BusinessProfile {
    name: String!
    description: String!
    model: String!
    idealCustomer: String
    quarterlyGoal: String
    accountingSoftware: String
  }

  type Invoice {
    id: ID!
    customerName: String!
    amountCents: Int!
    currency: String!
    status: String!
    issuedAt: String!
    dueAt: String!
    paidAt: String
  }

  type Kpi {
    id: ID!
    goal: String!
    keyResult: String!
    kpiName: String!
    dataSource: String
    currentValue: String
    targetValue: String
  }

  type AgingBucket {
    count: Int!
    totalCents: Int!
  }

  type DashboardSummary {
    revenueCents: Int!
    outstandingCents: Int!
    overdueCount: Int!
    agingCurrent: AgingBucket!
    aging0to30: AgingBucket!
    aging31to60: AgingBucket!
    aging60Plus: AgingBucket!
    recurringMonthlyCents: Int!
    projectedAnnualCents: Int!
    activeClientCount: Int!
    pipelineValueCents: Int!
    openLeadCount: Int!
    dueFollowupCount: Int!
  }

  type Client {
    id: ID!
    name: String!
    contact: String
    plan: String
    status: String!
    monthlyValueCents: Int!
    startDate: String!
    lastContact: String
    notes: String
  }

  type Lead {
    id: ID!
    name: String!
    contact: String
    source: String
    stage: String!
    estValueCents: Int!
    lastContact: String
    followUpDate: String
    lostReason: String
    notes: String
  }

  type AdvanceLeadResult {
    lead: Lead!
    client: Client
  }

  type Insight {
    content: String!
    createdAt: String!
  }

  input BusinessProfileInput {
    name: String!
    description: String!
    model: String!
    idealCustomer: String
    quarterlyGoal: String
    accountingSoftware: String
  }

  input CreateInvoiceInput {
    customerName: String!
    amountCents: Int!
    currency: String
    dueAt: String!
  }

  input KpiInput {
    goal: String!
    keyResult: String!
    kpiName: String!
    dataSource: String
    currentValue: String
    targetValue: String
  }

  input ClientInput {
    name: String!
    contact: String
    plan: String
    status: String
    monthlyValueCents: Int
    startDate: String
    lastContact: String
    notes: String
  }

  input LeadInput {
    name: String!
    contact: String
    source: String
    stage: String
    estValueCents: Int
    lastContact: String
    followUpDate: String
    lostReason: String
    notes: String
  }

  type Query {
    """The signed-in user. Null if the request has no valid access token."""
    me: Me
    businessProfile: BusinessProfile
    invoices: [Invoice!]!
    kpis: [Kpi!]!
    dashboardSummary: DashboardSummary!
    clients: [Client!]!
    """All leads, or filter with stage: PIPELINE (open, non-lost stages) or LOST (the follow-up ledger)."""
    leads(stage: String): [Lead!]!
  }

  type Mutation {
    updateBusinessProfile(input: BusinessProfileInput!): BusinessProfile!
    createInvoice(input: CreateInvoiceInput!): Invoice!
    markInvoicePaid(id: ID!): Invoice!
    createKpi(input: KpiInput!): Kpi!
    """Calls Claude server-side to read the profile, finances, clients and leads, and return tailored insights. Rate-limited per user."""
    generateInsights: Insight!
    createClient(input: ClientInput!): Client!
    updateClient(id: ID!, input: ClientInput!): Client!
    deleteClient(id: ID!): Boolean!
    createLead(input: LeadInput!): Lead!
    updateLead(id: ID!, input: LeadInput!): Lead!
    deleteLead(id: ID!): Boolean!
    """Guided pipeline move (new -> contacted -> proposal_sent -> won, or -> lost from any open stage). Winning a lead also creates a Client."""
    advanceLead(id: ID!, nextStage: String!): AdvanceLeadResult!
    """The only way back from 'lost' — resets to 'new' and clears the lost reason."""
    reengageLead(id: ID!): Lead!
  }
`;
