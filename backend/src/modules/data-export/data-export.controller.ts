import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { DataExportService } from './data-export.service';
import { DataImportService } from './data-import.service';
import { ITAdminJwtAuthGuard } from '../../guards/itAdminGuard.guard';
import { RequestWithITAdmin } from '../../common/interfaces/it-admin.interface';

// Import/rollback already get a durable audit trail via ImportSnapshot (actor, timestamp,
// strategy, summary, rolled-back-by). This schema has no generic cross-entity audit log table
// (ActivityEvent is Client-scoped with a real FK to Client, which an ITAdmin id can't satisfy),
// so export — a read-only action — is just logged, not persisted.
@UseGuards(ITAdminJwtAuthGuard)
@Controller('it-support/data-export')
export class DataExportController {
  private readonly logger = new Logger(DataExportController.name);

  constructor(
    private readonly exportService: DataExportService,
    private readonly importService: DataImportService,
  ) {}

  @Post('export')
  async export(@Body() options: any, @Req() req: RequestWithITAdmin, @Res() res: Response) {
    const format: string = options.format ?? 'json';
    const dateStr = new Date().toISOString().split('T')[0];
    const actor = { id: req.itAdmin.id, name: req.itAdmin.name };

    if (format === 'json') {
      const payload = await this.exportService.buildJsonExport(options, actor);
      const json = JSON.stringify(payload, null, 2);
      this.logger.log(`${actor.name} exported self-backup as JSON (${Object.keys(payload.meta.counts).length} tables)`);
      res.setHeader('Content-Disposition', `attachment; filename="abyexpense-self-backup-${dateStr}.json"`);
      res.setHeader('Content-Type', 'application/json');
      return res.send(json);
    }

    if (format === 'excel') {
      const buffer = await this.exportService.buildExcelExport(options);
      this.logger.log(`${actor.name} exported self-backup as Excel`);
      res.setHeader('Content-Disposition', `attachment; filename="abyexpense-export-${dateStr}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }

    if (format === 'pdf') {
      const buffer = await this.exportService.buildPdfExport(options);
      this.logger.log(`${actor.name} exported self-backup as PDF`);
      res.setHeader('Content-Disposition', `attachment; filename="abyexpense-report-${dateStr}.pdf"`);
      res.setHeader('Content-Type', 'application/pdf');
      return res.send(buffer);
    }

    return res.status(400).json({ message: 'Invalid format. Use json, excel, or pdf.' });
  }

  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async importPreview(@UploadedFile() file: Express.Multer.File, @Body() body: any) {
    if (!file) return { error: 'No file uploaded' };
    const payload = JSON.parse(file.buffer.toString('utf-8'));
    const strategy = body.conflictStrategy ?? 'SKIP';
    const groups: string[] | undefined = body.groups ? JSON.parse(body.groups) : undefined;
    return this.importService.preview(payload, strategy, groups);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async importData(@UploadedFile() file: Express.Multer.File, @Body() body: any, @Req() req: RequestWithITAdmin) {
    if (!file) return { error: 'No file uploaded' };
    const payload = JSON.parse(file.buffer.toString('utf-8'));
    const groups: string[] | undefined = body.groups ? JSON.parse(body.groups) : undefined;
    const options = { conflictStrategy: body.conflictStrategy ?? 'SKIP', groups };
    const actor = { id: req.itAdmin.id, name: req.itAdmin.name, fileName: file.originalname };
    const results = await this.importService.commit(payload, options, actor);

    const summary = results.reduce(
      (acc, r) => ({
        total: acc.total + r.total, created: acc.created + r.created, updated: acc.updated + r.updated,
        skipped: acc.skipped + r.skipped, failed: acc.failed + r.failed,
      }),
      { total: 0, created: 0, updated: 0, skipped: 0, failed: 0 },
    );

    this.logger.log(`${req.itAdmin.name} restored self-backup "${file.originalname}": +${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped, ${summary.failed} failed`);
    return { results, summary };
  }

  @Get('import/history')
  async importHistory() {
    return this.importService.listSnapshots();
  }

  @Post('import/rollback/:id')
  async rollbackImport(@Param('id') id: string, @Req() req: RequestWithITAdmin) {
    await this.importService.rollback(id, { id: req.itAdmin.id, name: req.itAdmin.name });
    this.logger.log(`${req.itAdmin.name} rolled back import ${id}`);
    return { success: true };
  }
}
