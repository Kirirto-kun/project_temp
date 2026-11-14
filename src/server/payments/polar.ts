import 'server-only';

export interface PolarClient {
  createCheckout(input: { productId: string; ownerId: string; successUrl: string }): Promise<{ id: string; url: string }>;
}

export class PolarError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'PolarError';
  }
}

export class PolarApi implements PolarClient {
  private readonly base: string;
  constructor(
    private readonly accessToken: string,
    server: 'sandbox' | 'production',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.base = server === 'production' ? 'https://api.polar.sh' : 'https://sandbox-api.polar.sh';
  }

  async createCheckout(input: { productId: string; ownerId: string; successUrl: string }) {
    const response = await this.fetchImpl(`${this.base}/v1/checkouts/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: [input.productId], success_url: input.successUrl, metadata: { owner_id: input.ownerId } }),
      cache: 'no-store',
    });
    if (!response.ok) throw new PolarError(response.status, `Checkout creation failed with ${response.status}`);
    const body = (await response.json()) as { id?: string; url?: string };
    if (!body.id || !body.url) throw new PolarError(502, 'Checkout response was incomplete');
    return { id: body.id, url: body.url };
  }
}
