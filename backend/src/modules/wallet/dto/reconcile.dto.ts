export class ReconcileDto {
  /** What the real account (bank app, MoMo, cash in hand) says right now. */
  actualBalance: number;
  /** Put the difference right by adding a Balance adjustment transaction. Without it nothing changes. */
  adjust?: boolean;
}
