import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { BrevoClient } from '@getbrevo/brevo';
import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly brevoClient: BrevoClient;
  private readonly senderEmail: string;
  private readonly senderName: string;

  constructor() {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) this.logger.warn('BREVO_API_KEY not set — emails will fail');

    this.brevoClient = new BrevoClient({ apiKey: apiKey || '' });
    this.senderEmail = process.env.EMAIL_FROM || 'no-reply@abyexpense.com';
    this.senderName  = process.env.EMAIL_FROM_NAME || 'ABY Expense';
  }

  private loadTemplate(name: string, data: Record<string, any>): string {
    const templatePath = path.join(process.cwd(), 'src', 'Templates', `${name}.hbs`);
    if (!fs.existsSync(templatePath)) {
      throw new BadRequestException(`Email template "${name}" not found`);
    }
    const src = fs.readFileSync(templatePath, 'utf-8');
    return handlebars.compile(src)(data);
  }

  async sendEmail(
    to: string | string[],
    subject: string,
    templateName: string,
    templateData: Record<string, any> = {},
  ): Promise<void> {
    const html = this.loadTemplate(templateName, templateData);
    const recipients = Array.isArray(to) ? to.map(e => ({ email: e })) : [{ email: to }];

    try {
      const result = await this.brevoClient.transactionalEmails.sendTransacEmail({
        sender: { email: this.senderEmail, name: this.senderName },
        to: recipients,
        subject,
        htmlContent: html,
      });
      this.logger.log(`Email sent → ${Array.isArray(to) ? to.join(', ') : to} [${result.messageId}]`);
    } catch (err) {
      this.logger.error('Brevo send failed', err);
      throw new Error('Failed to send email');
    }
  }
}
