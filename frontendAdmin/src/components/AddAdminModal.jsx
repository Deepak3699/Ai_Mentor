import { UserRoundPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ShieldAlert, Loader2, CheckCircle2 } from "lucide-react";

const SUPPORTED_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "superadmin", label: "Super Admin" },
];

export default function AddAdminModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  submitError,
  onClearError,
}) {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    role: "admin",
    sendInvitation: true,
  });

  const [errors, setErrors] = useState({});
  const [isSuccess, setIsSuccess] = useState(false);

  // Reset form state when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        fullName: "",
        email: "",
        role: "admin",
        sendInvitation: true,
      });
      setErrors({});
      setIsSuccess(false);
      onClearError?.();
    }
  }, [isOpen, onClearError]);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const validate = () => {
    const nextErrors = {};

    if (!formData.fullName.trim()) {
      nextErrors.fullName = "Full name is required.";
    } else if (formData.fullName.trim().length < 2) {
      nextErrors.fullName = "Full name must be at least 2 characters.";
    } else if (/\d/.test(formData.fullName)) {
      nextErrors.fullName = "Full name must not contain numbers.";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      nextErrors.email = "Email address is required.";
    } else if (!emailRegex.test(formData.email.trim())) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (!formData.role) {
      nextErrors.role = "Please select a role.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (submitError) {
      onClearError?.();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const ok = await onSubmit({
      name: formData.fullName.trim(),
      email: formData.email.trim(),
      role: formData.role,
      sendInvitation: formData.sendInvitation,
    });

    if (ok) {
      setIsSuccess(true);
      setTimeout(() => {
        onClose();
      }, 900);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-admin-modal-title"
    >
      <div className="bg-card border border-border text-main w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex flex-row items-center justify-between gap-4 border-b border-border bg-gradient-to-r from-teal-500/5 to-transparent p-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserRoundPlus size={24} />
          </div>

          <div className="min-w-0 flex-1">
            <h3 id="add-admin-modal-title" className="text-lg font-bold tracking-tight text-main">
              Add admin
            </h3>

            <p className="mt-1 text-xs font-medium leading-relaxed text-muted">
              Invite a teammate to manage the platform. They&apos;ll get an email to set up their
              account.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted transition-all duration-200 hover:border-red-500 hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form className="p-6 sm:p-8 space-y-5" onSubmit={handleSubmit} noValidate>
          {/* Full Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="admin-full-name"
              className="text-[10px] font-black uppercase tracking-widest text-muted ml-1 block"
            >
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              id="admin-full-name"
              type="text"
              placeholder="e.g. Aisha Kapoor"
              value={formData.fullName}
              onChange={(e) => handleChange("fullName", e.target.value)}
              disabled={isSubmitting || isSuccess}
              className={`w-full h-12 px-4 rounded-2xl bg-canvas border ${
                errors.fullName ? "border-red-500" : "border-border"
              } focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 outline-none transition-all font-medium text-sm text-main placeholder:text-muted/50`}
            />
            {errors.fullName && (
              <p className="text-xs font-semibold text-red-500 ml-1">{errors.fullName}</p>
            )}
          </div>

          {/* Email Address */}
          <div className="space-y-1.5">
            <label
              htmlFor="admin-email"
              className="text-[10px] font-black uppercase tracking-widest text-muted ml-1 block"
            >
              Email address <span className="text-red-500">*</span>
            </label>
            <input
              id="admin-email"
              type="email"
              placeholder="name@company.com"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              disabled={isSubmitting || isSuccess}
              className={`w-full h-12 px-4 rounded-2xl bg-canvas border ${
                errors.email ? "border-red-500" : "border-border"
              } focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 outline-none transition-all font-medium text-sm text-main placeholder:text-muted/50`}
            />
            {errors.email && (
              <p className="text-xs font-semibold text-red-500 ml-1">{errors.email}</p>
            )}
          </div>

          {/* Role Dropdown */}
          <div className="space-y-1.5">
            <label
              htmlFor="admin-role"
              className="text-[10px] font-black uppercase tracking-widest text-muted ml-1 block"
            >
              Role <span className="text-red-500">*</span>
            </label>
            <select
              id="admin-role"
              value={formData.role}
              onChange={(e) => handleChange("role", e.target.value)}
              disabled={isSubmitting || isSuccess}
              className={`w-full h-12 px-4 rounded-2xl bg-canvas border ${
                errors.role ? "border-red-500" : "border-border"
              } focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 outline-none transition-all font-bold text-sm text-main`}
            >
              {SUPPORTED_ROLES.map((r) => (
                <option key={r.value} value={r.value} className="bg-card text-main">
                  {r.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted ml-1">
              Roles control what this person can see and change.
            </p>
            {errors.role && (
              <p className="text-xs font-semibold text-red-500 ml-1">{errors.role}</p>
            )}
          </div>

          {/* Send Invitation Checkbox */}
          <label
            htmlFor="send-invitation-checkbox"
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-canvas border border-border cursor-pointer hover:border-teal-500/50 transition-all select-none"
          >
            <input
              id="send-invitation-checkbox"
              type="checkbox"
              checked={formData.sendInvitation}
              onChange={(e) => handleChange("sendInvitation", e.target.checked)}
              disabled={isSubmitting || isSuccess}
              className="w-4 h-4 rounded border-border accent-teal-500 cursor-pointer"
            />
            <span className="text-sm font-bold text-main">Send invitation email</span>
          </label>

          {/* API Error Feedback */}
          {submitError && (
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold">
              {submitError}
            </div>
          )}

          {/* Success Feedback */}
          {isSuccess && (
            <div className="p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-500 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Admin created successfully!</span>
            </div>
          )}

          {/* Footer Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 h-12 rounded-2xl border border-border font-bold uppercase tracking-widest text-[11px] text-main hover:bg-canvas-alt transition-all disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || isSuccess}
              className="flex-2 h-12 rounded-2xl bg-teal-500 text-white font-bold uppercase tracking-widest text-[11px] hover:bg-teal-600 shadow-xl shadow-teal-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{isSubmitting ? "Creating..." : "Create admin"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
