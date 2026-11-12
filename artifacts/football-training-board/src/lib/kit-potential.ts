import {
  kitRowHasContent, kitRowItemIds, PLAYER_KIT_ROWS, REPRESENTATION_COMPONENTS, REPRESENTATION_SET,
  savedKitSelections, suggestKitSlots, type KitCatalogItem, type KitRequestLine,
} from "./player-kit-catalog";
import { paymentCategory, type PaymentEntry } from "./payment-summary";

export type KitPotentialItem = KitCatalogItem & { price?: number | null; isActive?: number | null; itemType?: string };
export type KitPotentialEquipment = { playerId: number; trainingKit?: string | null; matchKit?: string | null };
type KitPayment = PaymentEntry & { playerId: number; amount: number };
const fullSuit = "rep_tracksuit";
const suitParts = REPRESENTATION_COMPONENTS.map(part => part.key);
const ordinaryRows = PLAYER_KIT_ROWS.filter(row => row.key !== REPRESENTATION_SET && row.key !== fullSuit);
const nonApparelPrices = new Set(["annual_fee", "registration_fee", "insurance_fee", "shuttle_fee"]);

export function estimateKitPotential(
  playerIds: number[], equipment: KitPotentialEquipment[], catalog: KitPotentialItem[],
  requests: KitRequestLine[], payments: KitPayment[],
) {
  const prices = new Map<string, number>();
  for (const item of catalog) {
    if (item.isActive === 0 || nonApparelPrices.has(item.itemType ?? "") ||
      item.price == null || !Number.isFinite(item.price) || item.price < 0) continue;
    for (const slot of item.kitSlots ?? suggestKitSlots(item)) {
      const cents = Math.round(item.price * 100);
      prices.set(slot, Math.min(prices.get(slot) ?? Infinity, cents));
    }
  }
  const coveredByPlayer = new Map<number, Set<string>>();
  const coveredFor = (id: number) => {
    const covered = coveredByPlayer.get(id) ?? new Set<string>();
    coveredByPlayer.set(id, covered);
    return covered;
  };
  const ambiguous = new Set<number>();
  const assignedValue = new Map<number, number>();
  for (const assignment of equipment) {
    const training = savedKitSelections(assignment.trainingKit);
    const match = savedKitSelections(assignment.matchKit);
    const rows = new Map([...match, ...training].map(row => [row.key, row]));
    if (!rows.size && [assignment.trainingKit, assignment.matchKit].some(raw => raw?.trim() && !/^[{[]/.test(raw.trim()))) {
      ambiguous.add(assignment.playerId);
    }
    for (const row of rows.values()) {
      if (!kitRowHasContent(row) && !row.ordered && row.assignment !== "manual") continue;
      const covered = coveredFor(assignment.playerId);
      const price = Number(String(row.price ?? "").replace(",", "."));
      if (row.assignment !== "loan" && Number.isFinite(price) && price > 0) {
        const quantity = Math.max(1, Math.floor(Number(row.quantity) || 1));
        assignedValue.set(assignment.playerId, (assignedValue.get(assignment.playerId) ?? 0) + Math.round(price * quantity * 100));
      }
      if (row.key === REPRESENTATION_SET && row.componentItemIds?.some(Boolean) && row.assignment !== "loan") {
        suitParts.forEach((slot, index) => { if (row.componentItemIds?.[index]) covered.add(slot); });
      } else if (row.key === REPRESENTATION_SET) {
        suitParts.forEach(slot => covered.add(slot));
      } else if (row.key) {
        covered.add(row.key);
      }
    }
  }
  for (const request of requests) {
    if (request.archived) continue;
    const covered = coveredFor(request.playerId);
    if (request.rowKey === REPRESENTATION_SET) suitParts.forEach(slot => covered.add(slot));
    else covered.add(request.rowKey);
  }
  // A standalone kit movement has no article IDs, so its uncovered pieces cannot be inferred safely.
  const booked = new Map<number, number>();
  for (const row of payments) {
    if (row.amount > 0 && paymentCategory(row) === "kit") {
      booked.set(row.playerId, (booked.get(row.playerId) ?? 0) + Math.round(row.amount * 100));
    }
  }
  const result = { withoutKit: 0, partialKit: 0, cents: 0, unpricedItems: 0, toVerify: 0 };
  for (const id of playerIds) {
    const covered = coveredByPlayer.get(id) ?? new Set<string>();
    const missing = ordinaryRows.filter(row => !covered.has(row.key)).map(row => prices.get(row.key));
    if (!covered.has(fullSuit)) {
      const missingParts = suitParts.filter(slot => !covered.has(slot));
      if (missingParts.length === suitParts.length) {
        const partsPrice = missingParts.reduce((total, slot) => total + (prices.get(slot) ?? Infinity), 0);
        const suitPrice = Math.min(prices.get(fullSuit) ?? Infinity, partsPrice);
        missing.push(Number.isFinite(suitPrice) ? suitPrice : undefined);
      } else {
        missing.push(...missingParts.map(slot => prices.get(slot)));
      }
    }
    if (!missing.length) continue;
    if ((booked.get(id) ?? 0) > (assignedValue.get(id) ?? 0) || ambiguous.has(id)) {
      result.toVerify++;
      continue;
    }
    if (covered.size) result.partialKit++;
    else result.withoutKit++;
    for (const price of missing) {
      if (price === undefined) result.unpricedItems++;
      else result.cents += price;
    }
  }
  return result;
}
