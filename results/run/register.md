# Zoho CRM configuration register

Snapshot 2026-11-02 · edition Professional

## Users

| User | Role | Profile | Status |
|---|---|---|---|
| Ana Ruiz | Sales Manager | Administrator | active |
| Ben Okafor | Sales Rep | Standard | active |
| Chloe Martin | Sales Rep | Standard | active |
| Dev Patel | Sales Rep | Standard | active |
| Ella Novak | Sales Rep | Standard | active |
| Farid Haddad | Sales Rep | Standard | inactive |
| Grace Lim | Sales Rep | Standard | active |

## Accounts

520 records · 13 fields, 2 custom (Professional allows 155 custom per module)

| Field | API name | Type | Custom | Filled |
|---|---|---|---|---|
| Account Owner * | `Owner` | ownerlookup |  | 100% |
| Created Time | `Created_Time` | datetime |  | 100% |
| Modified Time | `Modified_Time` | datetime |  | 100% |
| Last Activity Time | `Last_Activity_Time` | datetime |  | 86% |
| Description | `Description` | textarea |  | 0% |
| Account Name * (unique) | `Account_Name` | text |  | 100% |
| Phone | `Phone` | phone |  | 100% |
| Website | `Website` | website |  | 100% |
| Industry | `Industry` | picklist (10 options) |  | 100% |
| Billing City | `Billing_City` | text |  | 0% |
| Billing State | `Billing_State` | text |  | 0% |
| Contract Renewal | `Contract_Renewal` | date | yes | 28% |
| Region | `Region` | picklist (5 options) | yes | 81% |

## Deals

680 records · 15 fields, 2 custom (Professional allows 155 custom per module)

| Field | API name | Type | Custom | Filled |
|---|---|---|---|---|
| Deal Owner * | `Owner` | ownerlookup |  | 100% |
| Created Time | `Created_Time` | datetime |  | 100% |
| Modified Time | `Modified_Time` | datetime |  | 100% |
| Last Activity Time | `Last_Activity_Time` | datetime |  | 84% |
| Deal Name * | `Deal_Name` | text |  | 100% |
| Account Name | `Account_Name` | lookup |  | 100% |
| Contact Name | `Contact_Name` | lookup |  | 87% |
| Stage * | `Stage` | picklist (8 options) |  | 100% |
| Amount | `Amount` | currency |  | 81% |
| Closing Date * | `Closing_Date` | date |  | 100% |
| Probability (%) | `Probability` | integer |  | 98% |
| Pipeline | `Pipeline` | picklist (1 options) |  | 100% |
| Lead Source | `Lead_Source` | picklist (32 options) |  | 100% |
| Product Line | `Product_Line` | picklist (5 options) | yes | 69% |
| Loss Reason | `Loss_Reason` | picklist (5 options) | yes | 8% |

## Leads

3134 records · 32 fields, 11 custom (Professional allows 155 custom per module)

| Field | API name | Type | Custom | Filled |
|---|---|---|---|---|
| Lead Owner * | `Owner` | ownerlookup |  | 100% |
| Created Time | `Created_Time` | datetime |  | 100% |
| Modified Time | `Modified_Time` | datetime |  | 100% |
| Last Activity Time | `Last_Activity_Time` | datetime |  | 85% |
| Description | `Description` | textarea |  | 0% |
| First Name | `First_Name` | text |  | 100% |
| Last Name * | `Last_Name` | text |  | 100% |
| Email (unique) | `Email` | email |  | 98% |
| Phone | `Phone` | phone |  | 79% |
| Mobile | `Mobile` | phone |  | 35% |
| Title | `Title` | text |  | 100% |
| City | `City` | text |  | 0% |
| State | `State` | text |  | 0% |
| Lead Source | `Lead_Source` | picklist (32 options) |  | 100% |
| Company * | `Company` | text |  | 100% |
| Website | `Website` | website |  | 40% |
| Lead Status | `Lead_Status` | picklist (8 options) |  | 100% |
| Industry | `Industry` | picklist (10 options) |  | 69% |
| No. of Employees | `No_of_Employees` | integer |  | 35% |
| Annual Revenue | `Annual_Revenue` | currency |  | 15% |
| Rating | `Rating` | picklist (3 options) |  | 49% |
| Product Interest | `Product_Interest` | picklist (5 options) | yes | 59% |
| Region | `Region` | picklist (5 options) | yes | 54% |
| Budget Range | `Budget_Range` | picklist (4 options) | yes | 30% |
| Source Detail | `Source_Detail` | text | yes | 26% |
| Referral Partner | `Referral_Partner` | text | yes | 6% |
| Preferred Contact | `Preferred_Contact` | picklist (3 options) | yes | 3% |
| Old CRM ID | `Old_CRM_ID` | text | yes | 2% |
| Fax (alt) | `Fax_Alt` | phone | yes | 0% |
| Trade Show 2022 | `Trade_Show_2022` | boolean | yes | 1% |
| Temp Import Batch | `Temp_Import_Batch` | text | yes | 0% |
| Second Email (old) | `Second_Email_Old` | email | yes | 1% |

## Contacts

1442 records · 18 fields, 3 custom (Professional allows 155 custom per module)

| Field | API name | Type | Custom | Filled |
|---|---|---|---|---|
| Contact Owner * | `Owner` | ownerlookup |  | 100% |
| Created Time | `Created_Time` | datetime |  | 100% |
| Modified Time | `Modified_Time` | datetime |  | 100% |
| Last Activity Time | `Last_Activity_Time` | datetime |  | 83% |
| Description | `Description` | textarea |  | 0% |
| First Name | `First_Name` | text |  | 100% |
| Last Name * | `Last_Name` | text |  | 100% |
| Email (unique) | `Email` | email |  | 100% |
| Phone | `Phone` | phone |  | 72% |
| Mobile | `Mobile` | phone |  | 51% |
| Title | `Title` | text |  | 100% |
| City | `Mailing_City` | text |  | 0% |
| State | `Mailing_State` | text |  | 0% |
| Lead Source | `Lead_Source` | picklist (32 options) |  | 100% |
| Account Name | `Account_Name` | lookup |  | 100% |
| Region | `Region` | picklist (5 options) | yes | 81% |
| Birthday Card | `Birthday_Card` | boolean | yes | 1% |
| Old CRM ID | `Old_CRM_ID` | text | yes | 3% |

## Pipeline: Standard (Standard)

1. Qualification (Open, forecast: Pipeline)
2. Needs Analysis (Open, forecast: Pipeline)
3. Proposal/Price Quote (Open, forecast: Pipeline)
4. Negotiation/Review (Open, forecast: Pipeline)
5. Closed Won (Closed Won, forecast: Closed)
6. Closed Lost (Closed Lost, forecast: Omitted)

## Workflow rules

| Rule | Module | Active | Trigger | Criteria | Actions | Last run |
|---|---|---|---|---|---|---|
| New web lead - notify owner | Leads | yes | create | Lead_Source in Website, Web Form, web form, Web Site | email notifications: New web lead | 2026-11-01 |
| New web lead - notify owner (copy) | Leads | yes | create | Lead_Source in Website, Web Form, web form, Web Site | email notifications: New web lead | 2026-11-02 |
| Lead changed - notify owner | Leads | yes | create_or_edit, every time | all records | email notifications: Lead updated | 2026-11-02 |
| Hot lead - task in 1 day | Leads | yes | create | Rating equal Hot | tasks: Call hot lead; email notifications: Hot lead | 2026-10-31 |
| Contacted - schedule follow-up | Leads | yes | field_update (Lead_Status) | Lead_Status equal Contacted | tasks: Follow up in 3 days | 2026-11-02 |
| Junk lead - notify manager | Leads | yes | field_update (Lead_Status) | Lead_Status equal Junk Lead | email notifications: Junk lead | 2026-10-30 |
| Trade show 2022 follow-up | Leads | no | create | Trade_Show_2022 equal true | tasks: Send booth follow-up | 2022-10-14 |
| Test rule do not use | Leads | no | create | all records | field updates: Set rating | never |
| Push lead to old email tool | Leads | yes | create | all records | webhooks: POST to mail-sync (retired 2024) | 2026-11-01 |
| Deal changed - notify owner | Deals | yes | create_or_edit, every time | all records | email notifications: Deal updated | 2026-11-02 |
| Stage change - notify manager | Deals | yes | field_update (Stage) | all records | email notifications: Stage changed | 2026-11-01 |
| Closed won - tell the team | Deals | yes | field_update (Stage) | Stage equal Closed Won | email notifications: Deal won | 2026-10-30 |
| Closed lost - ask for reason | Deals | yes | field_update (Stage) | Stage equal Closed Lost | tasks: Record loss reason | 2026-11-01 |
| Value Proposition stage task | Deals | yes | field_update (Stage) | Stage equal Value Proposition | tasks: Send value deck | 2023-03-02 |
| New contact - welcome task | Contacts | yes | create | all records | tasks: Welcome call | 2026-11-01 |
| Contact changed - notify owner | Contacts | no | create_or_edit, every time | all records | email notifications: Contact updated | 2025-12-15 |
