import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";

export type SendMailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  isConfigured(): boolean {
    return Boolean(
      process.env["SMTP_HOST"]?.trim() &&
        process.env["SMTP_USER"]?.trim() &&
        process.env["SMTP_PASS"]?.trim(),
    );
  }

  private getTransporter(): Transporter {
    if (!this.isConfigured()) {
      throw new Error("SMTP not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS");
    }
    if (!this.transporter) {
      const port = Number(process.env["SMTP_PORT"] ?? 587);
      const secure = process.env["SMTP_SECURE"] === "true" || String(port) === "465";
      this.transporter = createTransport({
        host: process.env["SMTP_HOST"],
        port,
        secure,
        auth: { user: process.env["SMTP_USER"], pass: process.env["SMTP_PASS"] },
      });
    }
    return this.transporter;
  }

  getDefaultFrom(): string {
    return (
      process.env["SMTP_FROM"]?.trim() ||
      `"Pryrox" <${process.env["SMTP_USER"]}>`
    );
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(`SMTP not configured — email to ${options.to} not sent`);
      return;
    }
    const transport = this.getTransporter();
    await transport.sendMail({
      from: this.getDefaultFrom(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    this.logger.log(`Email sent to ${options.to}: ${options.subject}`);
  }
}
