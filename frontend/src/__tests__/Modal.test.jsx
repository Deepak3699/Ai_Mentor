import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Modal from "../components/common/Modal";
import ReportModal from "../components/common/ReportModal";

const dialogPrototype = HTMLDialogElement.prototype;
const originalShowModal = Object.getOwnPropertyDescriptor(dialogPrototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(dialogPrototype, "close");
const originalGetClientRects = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "getClientRects",
);

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "getClientRects", {
    configurable: true,
    value() {
      return [{ width: 1, height: 1 }];
    },
  });
  Object.defineProperty(dialogPrototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(dialogPrototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  });
});

afterEach(() => {
  cleanup();
  if (originalShowModal) {
    Object.defineProperty(dialogPrototype, "showModal", originalShowModal);
  } else {
    delete dialogPrototype.showModal;
  }
  if (originalClose) {
    Object.defineProperty(dialogPrototype, "close", originalClose);
  } else {
    delete dialogPrototype.close;
  }
  if (originalGetClientRects) {
    Object.defineProperty(
      HTMLElement.prototype,
      "getClientRects",
      originalGetClientRects,
    );
  } else {
    delete HTMLElement.prototype.getClientRects;
  }
});

function ModalHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        labelledBy="test-modal-title"
      >
        <h2 id="test-modal-title">Test dialog</h2>
        <button>First action</button>
        <button>Last action</button>
      </Modal>
      <button>Background action</button>
    </>
  );
}

describe("Modal", () => {
  it("opens as a named dialog and closes when Escape is pressed", () => {
    render(<ModalHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));

    const dialog = screen.getByRole("dialog", { name: "Test dialog" });
    expect(dialog.open).toBe(true);

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(dialog.open).toBe(false);
  });

  it("closes when the browser sends a dialog cancel request", () => {
    render(<ModalHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));

    const dialog = screen.getByRole("dialog", { name: "Test dialog" });
    const cancelEvent = new Event("cancel", { cancelable: true });

    fireEvent(dialog, cancelEvent);

    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
  });

  it("wraps Tab and Shift+Tab at the dialog boundaries", () => {
    render(<ModalHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));

    const dialog = screen.getByRole("dialog", { name: "Test dialog" });
    const firstAction = screen.getByRole("button", { name: "First action" });
    const lastAction = screen.getByRole("button", { name: "Last action" });

    lastAction.focus();
    fireEvent.keyDown(lastAction, { key: "Tab" });
    expect(document.activeElement).toBe(firstAction);

    firstAction.focus();
    fireEvent.keyDown(firstAction, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastAction);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("reports the report dropdown expanded state to assistive technology", () => {
    const setReportType = () => {};
    const setSelectedCourse = () => {};
    const setSubType = () => {};

    render(
      <ReportModal
        show
        onClose={() => {}}
        onSubmit={() => {}}
        reportText=""
        setReportText={() => {}}
        reportType="Select Issue Type"
        setReportType={setReportType}
        enrolledCourses={[]}
        subType=""
        setSubType={setSubType}
        selectedCourse=""
        setSelectedCourse={setSelectedCourse}
        loading={false}
      />,
    );

    const issueTypeButton = screen.getByRole("button", {
      name: /select issue type/i,
    });
    expect(issueTypeButton.getAttribute("aria-haspopup")).toBe("listbox");
    expect(issueTypeButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(issueTypeButton);
    expect(issueTypeButton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox")).toBeTruthy();
  });
});
