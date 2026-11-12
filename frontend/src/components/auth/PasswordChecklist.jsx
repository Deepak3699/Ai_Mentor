import { Check, X } from "lucide-react";
import { PASSWORD_REQUIREMENTS, getPasswordChecks } from "../../lib/passwordRules";

const ValidationItem = ({ label, met }) => (
  <li
    className={`flex items-center gap-1.5 ${
      met ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"
    }`}
  >
    {met ? <Check size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />}
    <span className="text-xs">{label}</span>
    <span className="sr-only"> — {met ? "met" : "not met"}</span>
  </li>
);

const PasswordChecklist = ({ password = "" }) => {
  const checks = getPasswordChecks(password);

  return (
    <ul
      aria-label="Password requirements"
      className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3"
    >
      {PASSWORD_REQUIREMENTS.map((rule) => (
        <ValidationItem key={rule.id} label={rule.label} met={Boolean(checks[rule.id])} />
      ))}
    </ul>
  );
};

export default PasswordChecklist;
