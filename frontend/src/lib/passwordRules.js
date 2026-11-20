import { z } from "zod";

export const PASSWORD_REQUIREMENTS = [
  {
    id: "length",
    label: "8+ Characters",
    test: (password) => password.length >= 8,
    errorMessage: "Password must be at least 8 characters",
  },
  {
    id: "capital",
    label: "Uppercase",
    test: (password) => /[A-Z]/.test(password),
    errorMessage: "Password must contain at least one uppercase letter",
  },
  {
    id: "lower",
    label: "Lowercase",
    test: (password) => /[a-z]/.test(password),
    errorMessage: "Password must contain at least one lowercase letter",
  },
  {
    id: "number",
    label: "Number",
    test: (password) => /[0-9]/.test(password),
    errorMessage: "Password must contain at least one number",
  },
  {
    id: "symbol",
    label: "Symbol",
    test: (password) => /[!@#$%^&*(),.?":{}|<>]/.test(password),
    errorMessage: "Password must contain at least one symbol",
  },
];

export const getPasswordChecks = (password = "") => {
  return PASSWORD_REQUIREMENTS.reduce((acc, req) => {
    acc[req.id] = req.test(password);
    return acc;
  }, {});
};

export const passwordSchema = PASSWORD_REQUIREMENTS.reduce((schema, req) => {
  if (req.id === "length") {
    return schema.min(8, req.errorMessage);
  }

  return schema.refine(req.test, { message: req.errorMessage });
}, z.string());
