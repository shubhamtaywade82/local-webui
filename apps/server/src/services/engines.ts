import { MarketRegistry } from '@workspace/market-registry';
import { TimeframeEngine } from '@workspace/timeframe-engine';
import { SignalEngine }    from '@workspace/signal-engine';
import { RiskEngine }      from '@workspace/risk-engine';
import { ExecutionEngine } from '@workspace/execution-engine';
import { db }              from './db';

// DB adapter shims — packages define minimal interfaces; db satisfies them structurally.

const registryDb = {
  saveFuturesInstrument: db.saveFuturesInstrument.bind(db),
  listActiveFuturesInstruments: db.listActiveFuturesInstruments.bind(db),
};

const snapshotDb = {
  upsertCandleSnapshot: db.upsertCandleSnapshot.bind(db),
  getCandleSnapshot:    db.getCandleSnapshot.bind(db),
};

const signalDb = {
  saveTradeSignal: db.saveTradeSignal.bind(db),
};

const executionDb = {
  saveOrder:            db.saveOrder.bind(db),
  updateOrderStatus:    db.updateOrderStatus.bind(db),
  savePosition:         db.savePosition.bind(db),
  updatePosition:       db.updatePosition.bind(db),
  getOpenPosition:      db.getOpenPosition.bind(db),
  saveFill:             db.saveFill.bind(db),
  saveExecutionEvent:   db.saveExecutionEvent.bind(db),
};

export const marketRegistry  = new MarketRegistry(registryDb);
export const timeframeEngine = new TimeframeEngine(snapshotDb);
export const signalEngine    = new SignalEngine(timeframeEngine, signalDb);
export const riskEngine      = new RiskEngine(marketRegistry);
export const executionEngine = new ExecutionEngine(marketRegistry, executionDb);
