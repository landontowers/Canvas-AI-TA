import { CrisisAlertPort, CrisisAlertResult, CrisisIncident } from '@virtual-ta/core';

export class FakeCrisisAlertAdapter implements CrisisAlertPort {
  readonly channelName = 'fake-crisis-alert';
  public dispatched: CrisisIncident[] = [];

  async dispatchAlert(incident: CrisisIncident): Promise<CrisisAlertResult> {
    this.dispatched.push(incident);
    return {
      success: true,
      dispatchId: incident.id,
      channel: 'fake',
    };
  }
}
