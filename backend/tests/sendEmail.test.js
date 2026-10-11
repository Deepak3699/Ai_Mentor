import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import sendEmail from "../utils/sendEmail.js";

const sensitive = {
    email: "recipient@example.com",
    host: "smtp.example.internal",
    user: "smtp-account@example.com",
    password: "smtp-super-secret",
    messageId: "<provider-message-id-123>",
    message: "Reset link https://example.com/reset/secret-token",
};

const setupEnv = () => {
    process.env.SMTP_HOST = sensitive.host;
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = sensitive.user;
    process.env.SMTP_PASS = sensitive.password;
    process.env.FROM_NAME = "AI-Mentor";
    process.env.FROM_EMAIL = "from@example.com";
};

const assertSensitiveValuesAbsent = (loggedOutput) => {
    for (const value of Object.values(sensitive)) {
        assert.equal(
            loggedOutput.includes(value),
            false,
            `Sensitive value was logged: ${value}`
        );
    }
};

afterEach(() => {
    mock.restoreAll();
});

test("successful email logs only safe fields", async () => {
    setupEnv();

    const sendMail = mock.fn(async () => ({
        messageId: sensitive.messageId,
    }));

    mock.method(nodemailer, "createTransport", () => ({
        sendMail,
    }));

    const infoLog = mock.method(console, "info");
    const errorLog = mock.method(console, "error");

    await sendEmail({
        email: sensitive.email,
        subject: "Password Reset",
        message: sensitive.message,
        html: `<p>${sensitive.message}</p>`,
    });

    assert.equal(infoLog.mock.calls.length, 1);
    assert.deepEqual(infoLog.mock.calls[0].arguments, [
        "[email] send success",
        {
            event: "email_send",
            outcome: "success",
        },
    ]);

    assert.equal(errorLog.mock.calls.length, 0);

    const loggedOutput = JSON.stringify(infoLog.mock.calls);
    assertSensitiveValuesAbsent(loggedOutput);
});

test("failed email logs only safe fields", async () => {
    setupEnv();

    const providerError = new Error(
        `SMTP rejected ${sensitive.email}`
    );
    providerError.response = `Provider diagnostic ${sensitive.messageId}`;

    const sendMail = mock.fn(async () => {
        throw providerError;
    });

    mock.method(nodemailer, "createTransport", () => ({
        sendMail,
    }));

    const infoLog = mock.method(console, "info");
    const errorLog = mock.method(console, "error");

    await assert.rejects(
        sendEmail({
            email: sensitive.email,
            subject: "Password Reset",
            message: sensitive.message,
            html: `<p>${sensitive.message}</p>`,
        }),
        providerError
    );

    assert.equal(errorLog.mock.calls.length, 1);
    assert.deepEqual(errorLog.mock.calls[0].arguments, [
        "[email] send failed",
        {
            event: "email_send",
            outcome: "failure",
        },
    ]);

    assert.equal(infoLog.mock.calls.length, 0);

    const loggedOutput = JSON.stringify(errorLog.mock.calls);
    assertSensitiveValuesAbsent(loggedOutput);
});