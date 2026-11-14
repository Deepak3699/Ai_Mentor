import { useId, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import AuthLayout from "../components/auth/AuthLayout";
import PasswordChecklist from "../components/auth/PasswordChecklist";
import axios from "axios";
import { z } from "zod";
import { getErrorMessage } from "../lib/errorHandling.js";
import { passwordSchema } from "../lib/passwordRules.js";

const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const newPasswordId = useId();
  const confirmPasswordId = useId();
  const confirmErrorId = useId();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const validationResult = resetPasswordSchema.parse({ password, confirmPassword });
      await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/auth/reset-password/${token}`, {
        password: validationResult.password,
      });

      setSuccess(true);
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError(getErrorMessage(err, "Unable to reset password."));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Reset Password" subtitle="Set a new password for your account.">
      <div className="mt-8">
        {success ? (
          <div className="text-center">
            <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-4 rounded-lg text-sm mb-6">
              Password has been reset successfully! Redirecting you to login...
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor={newPasswordId}
                  className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  New Password
                </label>
                <div className="relative">
                  <input
                    id={newPasswordId}
                    type={showPassword ? "text" : "password"}
                    className="w-full px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00BEA5] focus:border-transparent transition-all dark:bg-[#0f172a] dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
                    placeholder="••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <PasswordChecklist password={password} />
              </div>

              <div>
                <label
                  htmlFor={confirmPasswordId}
                  className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Confirm New Password
                </label>
                <input
                  id={confirmPasswordId}
                  type={showPassword ? "text" : "password"}
                  className={`w-full px-3 py-2.5 rounded-lg bg-gray-50 border text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all dark:bg-[#0f172a] dark:text-white dark:placeholder-gray-500 ${
                    passwordsMismatch
                      ? "border-red-500 focus:ring-red-500 dark:border-red-500"
                      : "border-gray-200 focus:ring-[#00BEA5] dark:border-gray-700"
                  }`}
                  placeholder="••••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-invalid={passwordsMismatch}
                  aria-describedby={passwordsMismatch ? confirmErrorId : undefined}
                  required
                />
                {passwordsMismatch && (
                  <p
                    id={confirmErrorId}
                    role="alert"
                    className="mt-1.5 text-xs text-red-600 dark:text-red-400"
                  >
                    Passwords do not match
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#2186df] to-[#02ffbb] text-white font-bold text-base shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? "Resetting..." : "Reset Password"}
            </button>

            <div className="text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-[#2186df] transition-colors"
              >
                <ArrowLeft size={14} />
                Back to Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </AuthLayout>
  );
};

export default ResetPassword;
