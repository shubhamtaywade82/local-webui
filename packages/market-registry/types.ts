export interface InstrumentMeta {
  pair: string;
  baseCurrency: string;
  minQuantity: number;
  maxQuantity: number;
  quantityIncrement: number;
  priceIncrement: number;
  maxLeverage: number;
  minNotional: number;
  status: 'active' | 'expired';
  fetchedAt: number; // epoch ms
}

export interface RegistryDbAdapter {
  saveFuturesInstrument(
    pair: string,
    status: string,
    metadata: Record<string, unknown>,
  ): Promise<unknown>;
  listActiveFuturesInstruments(): Promise<
    Array<{ pair: string; metadata: Record<string, unknown>; updatedAt: Date }>
  >;
}
