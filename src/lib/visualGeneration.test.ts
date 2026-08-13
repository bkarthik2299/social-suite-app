import { describe, expect, it } from 'vitest';
import { inferLogoPlacement, inferVisualSlidePlan } from '../../supabase/functions/_shared/visual_asset';

describe('visual generation planning', () => {
  it('keeps ordinary visual guides as one image', () => {
    expect(inferVisualSlidePlan('A premium product photograph with soft light.')).toMatchObject({
      count: 1,
      isCarousel: false,
    });
  });

  it('creates one standalone prompt for each explicitly requested carousel slide', () => {
    const plan = inferVisualSlidePlan('Four-slide carousel. Slide 1: Hook. Slide 2: Problem. Slide 3: Solution. Slide 4: CTA.');

    expect(plan.count).toBe(4);
    expect(plan.prompts).toHaveLength(4);
    expect(plan.prompts[1]).toContain('Render only slide 2 of 4');
    expect(plan.prompts[1]).toContain('Direction for this slide: Problem.');
    expect(plan.prompts[1]).toContain('Never show multiple slides');
  });

  it('counts numbered slides when the total is omitted', () => {
    expect(inferVisualSlidePlan('Carousel: Slide 1: Hook. Slide 2: Detail. Slide 3: CTA.').count).toBe(3);
  });

  it('defaults an unspecified carousel to four separate slides', () => {
    expect(inferVisualSlidePlan('Create a carousel explaining the process.').count).toBe(4);
  });

  it('parses em-dash slide headings used in production creative briefs', () => {
    const plan = inferVisualSlidePlan('Three-slide carousel. Slide 1 — Hook: First idea. Slide 2 — Insight: Second idea. Slide 3 — Resolution: Third idea.');

    expect(plan.count).toBe(3);
    expect(plan.prompts[0]).toContain('Hook: First idea.');
    expect(plan.prompts[1]).toContain('Insight: Second idea.');
    expect(plan.prompts[2]).toContain('Resolution: Third idea.');
  });

  it('treats a LinkedIn document post as separate pages', () => {
    const plan = inferVisualSlidePlan('LinkedIn document post. Use a document-style multi-page composition with a cover, two inner cards, and a closing page. Place CTA details on the final page only.');

    expect(plan.count).toBe(4);
    expect(plan.isCarousel).toBe(true);
    expect(plan.prompts).toHaveLength(4);
    expect(plan.prompts[0]).toContain('Render only page 1 of 4');
    expect(plan.prompts[0]).toContain('Create the cover page');
    expect(plan.prompts[1]).toContain('inner content page 1 of 2');
    expect(plan.prompts[3]).toContain('Create the closing page');
    expect(plan.prompts[3]).toContain('exactly one page filling the entire canvas');
    expect(plan.prompts[3]).toContain('Never show multiple pages');
  });

  it('supports explicitly numbered document pages', () => {
    const plan = inferVisualSlidePlan('Multi-page LinkedIn document. Page 1 — Hook. Page 2 — Proof. Page 3 — CTA.');

    expect(plan.count).toBe(3);
    expect(plan.prompts[1]).toContain('Direction for this page: Proof.');
  });

  it('does not mistake an ordinary single-page reference for a carousel', () => {
    expect(inferVisualSlidePlan('Show a phone displaying a clean booking page.').count).toBe(1);
  });
});

describe('logo placement', () => {
  it('honors explicit placement language', () => {
    expect(inferLogoPlacement('Keep the approved logo in the top-left safe area.')).toBe('top-left');
    expect(inferLogoPlacement('Logo at lower right with clear space.')).toBe('bottom-right');
  });

  it('uses a safe bottom-right default', () => {
    expect(inferLogoPlacement('Use a restrained logo treatment.')).toBe('bottom-right');
  });
});
