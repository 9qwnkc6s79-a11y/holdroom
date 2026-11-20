const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^HATCH-[A-Z0-9]{4,12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const FIRM_SIZES = ["", "Under 50", "50–250", "250–1000", "1000+"];
export const STATUSES = ["pending", "approved", "declined"];

function text(value) {
  if (value == null) return "";
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}

export function parseInquiry(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Invalid request." };
  }

  const honeypot = text(input.hp_field);
  if (honeypot) return { spam: true };

  const requestType = text(input.requestType);
  if (requestType !== "beta" && requestType !== "inquiry") {
    return { error: "Choose beta access or a general inquiry." };
  }

  const name = text(input.name);
  const email = text(input.email).toLowerCase();
  const firm = text(input.firm);
  const role = text(input.role);
  const firmSize = text(input.firmSize);
  const notes = text(input.notes);

  if (!name || !email || !firm) {
    return { error: "Name, firm, and work email are required." };
  }
  if (name.length > 80) return { error: "Name is too long." };
  if (firm.length > 120) return { error: "Firm is too long." };
  if (email.length > 120 || !EMAIL.test(email)) {
    return { error: "Enter a valid work email." };
  }
  if (role.length > 80) return { error: "Role is too long." };
  if (!FIRM_SIZES.includes(firmSize)) return { error: "Choose a firm size from the list." };
  if (notes.length > 2000) return { error: "Notes are too long." };

  return {
    value: { requestType, name, email, firm, role, firmSize, notes },
  };
}

export function parseStatusPatch(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Invalid request." };
  }
  const id = text(input.id);
  if (!UUID.test(id)) return { error: "Unknown request." };

  const status = text(input.status);
  if (!STATUSES.includes(status)) return { error: "Choose pending, approved, or declined." };

  let assignedCode = null;
  if (input.assignedCode != null && text(input.assignedCode) !== "") {
    assignedCode = text(input.assignedCode).toUpperCase();
    if (!CODE.test(assignedCode)) {
      return { error: "Invite codes look like HATCH-XXXX." };
    }
  }
  if (status === "approved" && !assignedCode) {
    return { error: "Enter an invite code to approve." };
  }

  return { value: { id, status, assignedCode } };
}

export function isRequestId(id) {
  return UUID.test(text(id));
}
