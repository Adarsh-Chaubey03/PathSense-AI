# Hackathon Technical Disclosure & Compliance Document

## Team Information

- **Team Name**: Ved Vahini
- **Project Title**: Visually impaired individuals face a heightened risk of falls due to limited environmental awareness. There is a need for an intelligent, smartphone-based fall detection system that leverages built in IMU sensors. Create a solution in this regard.

- **Problem Statement / Track**: 5
- **Team Members**: Adarsh Chaubey, Sakshi Gupta, Aditya Laxkar, Abhinav Patra
- **Repository Link (if public)**: https://github.com/adarshchaubey03/PathSense-AI/
- **Deployment Link (if applicable)**: It is an Application.

---

make a dot in square brackets for selection

## 1. APIs & External Services Used

For **each API / external service**, teams must clearly specify the following:

### API / Service Entry

- **API / Service Name**:
- **Provider / Organization**:
- **Purpose in Project**:
- **API Type**:
  - [x] REST
  - [ ] GraphQL
  - [x] SDK
  - [ ] Other (specify)
- **License Type**:
  - [x] Open Source
  - [ ] Free Tier
  - [ ] Academic
  - [ ] Commercial
- **License Link / Documentation URL**:
- **Rate Limits (if any)**:
- **Commercial Use Allowed**:
  - [x] Yes
  - [ ] No
  - [ ] Unclear

> Repeat this section for every API or external service used.

---

## 2. API Keys & Credentials Declaration

Teams **must disclose how API keys or credentials are obtained and handled**.

- **API Key Source**:
  - [ ] Self-generated from official provider
  - [ ] Hackathon-provided key
  - [x] Open / Keyless API
- **Key Storage Method**:
  - [ ] Environment Variables
  - [ ] Secure Vault
  - [ ] Backend-only (not exposed)
- **Hardcoded in Repository**:
  - [ ] Yes
  - [ ] No

  **Hardcoding API keys in public repositories will lead to disqualification.**

---

## 3. Open Source Libraries & Frameworks

List **all major libraries, frameworks, and SDKs** used.

| Name           | Version | Purpose     | License |
| -------------- | ------- | ----------- | ------- |
| Example: React | 18.x    | Frontend UI | MIT     |

---

## 4. AI Models, Tools & Agents Used

Teams must **explicitly disclose all AI usage**.

### AI Models

- **Model Name**:
- **Provider**: self
- **Used For** : Identifying Potential Fall values
- **Access Method**:
  - [ ] API
  - [x] Local Model
  - [ ] Hosted Platform

### AI Tools / Platforms

- **Tool Name**:
- **Role in Project**:
- **Level of Dependency**:
  - [ ] Assistive
  - [x] Core Logic
  - [ ] Entire Solution

---

## 5. AI Agent Usage Declaration (IMPORTANT)

The following must be declared clearly:

- **AI Agents Used** (if any):
  - [] None
  - [x] Yes

### If Yes:

- **Agent Name / Platform**:
- **Capabilities Used**:
  - [x] Code generation
  - [ ] Full app scaffolding
  - [ ] Decision making
  - [ ] Autonomous workflows
- **Human Intervention Level**:
  - [x] High (manual design & logic)
  - [ ] Medium
  - [ ] Low (mostly autonomous)

---

## 6. Restricted / Discouraged AI Services

To preserve **originality, creativity, and fair competition**, the following restrictions apply:

### Disallowed

- Fully autonomous platforms that:
  - Generate **entire applications end-to-end**
  - Make architectural decisions without human reasoning
  - Auto-generate UI + backend + deployment with minimal input

### Restricted (Must Be Declared & Justified)

Examples include but are not limited to:

- Emergent-style autonomous app builders
- Full-stack auto-generation agents
- Prompt-to-product systems

Usage is allowed **only if**:

- Core logic is human-designed
- AI is used as an **assistant**, not a replacement
- Teams can clearly explain architecture & decisions

Failure to justify usage may impact **innovation and originality scores**.

---

## 7. Originality & Human Contribution Statement

Briefly explain:

- What parts were **designed and implemented by humans**
  - The overall architecture, the techniques and the overall high level flow of which routes need to be created and what there roles need to be, and which permissions are required, along with that, we generated thousands of lines of actual data with real life simulated falls

- What parts were **assisted by AI**
  - The internal routing design and folder structure, and caching reccomendations and implementation
  - Generation of Yaml files, UI implementation, Not planning and design.

- What makes your solution **unique**
  - Extensive dataset, which we tried and tested and trained our model on, with practice falls, stability test
  - Depth, Gyro, and future implementation of Wifi signals for 3D overview of the entire room, research on this exists and is being worked on right now.
  - SOS signalling to nearby devices, based on bluetooth
  - Voice response, Triple clicking the sound down button is enough to signal that the user is safe
  - Cache based storage for specific false flags from the user, to ensure that similar values dont result in false flags again.
   

---

## 8. Ethical, Legal & Compliance Checklist

- [x] No copyrighted data used without permission
- [x] No leaked or private datasets
- [x] API usage complies with provider TOS
- [x] No malicious automation or scraping
- [x] No AI-generated plagiarism

---

## 9. Final Declaration

> We confirm that all information provided above is accurate.  
> We understand that misrepresentation may lead to disqualification.

**Team Representative Name**:

---
