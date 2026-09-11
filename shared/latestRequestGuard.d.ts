export interface LatestRequestGuard {
  begin(): number;
  cancel(): void;
  isCurrent(token: number): boolean;
}

export declare function createLatestRequestGuard(): LatestRequestGuard;
