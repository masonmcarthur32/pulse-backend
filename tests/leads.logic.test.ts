import { canAdvanceTo } from '@/modules/leads/leads.service';

describe('canAdvanceTo (lead pipeline transition graph)', () => {
  it('allows the forward path: new -> contacted -> proposal_sent -> won', () => {
    expect(canAdvanceTo('new', 'contacted')).toBe(true);
    expect(canAdvanceTo('contacted', 'proposal_sent')).toBe(true);
    expect(canAdvanceTo('proposal_sent', 'won')).toBe(true);
  });

  it('allows moving to lost from any open stage', () => {
    expect(canAdvanceTo('new', 'lost')).toBe(true);
    expect(canAdvanceTo('contacted', 'lost')).toBe(true);
    expect(canAdvanceTo('proposal_sent', 'lost')).toBe(true);
  });

  it('rejects skipping a stage', () => {
    expect(canAdvanceTo('new', 'proposal_sent')).toBe(false);
    expect(canAdvanceTo('new', 'won')).toBe(false);
    expect(canAdvanceTo('contacted', 'won')).toBe(false);
  });

  it('rejects moving backwards', () => {
    expect(canAdvanceTo('contacted', 'new')).toBe(false);
    expect(canAdvanceTo('proposal_sent', 'contacted')).toBe(false);
  });

  it('treats won and lost as terminal — no generic transition out of either', () => {
    expect(canAdvanceTo('won', 'new')).toBe(false);
    expect(canAdvanceTo('won', 'lost')).toBe(false);
    expect(canAdvanceTo('lost', 'new')).toBe(false);
    expect(canAdvanceTo('lost', 'contacted')).toBe(false);
  });

  it('rejects a no-op transition to the same stage', () => {
    expect(canAdvanceTo('new', 'new')).toBe(false);
    expect(canAdvanceTo('contacted', 'contacted')).toBe(false);
  });
});
