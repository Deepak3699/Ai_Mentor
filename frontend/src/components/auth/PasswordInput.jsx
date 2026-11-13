import { useState } from "react";

const PasswordInput = ({ label, placeholder }) => {
  const [show, setShow] = useState(false);

  return (
    <div className="mb-3">
      <label className="form-label">{label}</label>
      <div className="input-group">
        <input type="password" className="form-control password-input" placeholder={placeholder} />
        <span
          className="input-group-text"
          style={{ cursor: "pointer" }}
          onClick={() => setShow(!show)}
        >
          👁
        </span>
      </div>
    </div>
  );
};

export default PasswordInput;
