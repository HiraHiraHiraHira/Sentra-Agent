import { getDisplayName } from './icons';
import launchpadConfig from '../config/launchpad.json';

export type LaunchpadItem = { name: string; type: 'module' | 'plugin'; onClick: () => void };

type PriorityRule = { type: 'exact' | 'includes'; value: string };

type PageRule = {
  kind: 'builtin' | 'type' | 'name' | 'any';
  match: 'exact' | 'includes' | 'always';
  value: string;
};

type LaunchpadPage = {
  id: string;
  title?: string;
  include?: PageRule[];
  exclude?: PageRule[];
  require?: PageRule[];
  sort?: 'name' | 'none';
  overflow?: 'split' | 'truncate';
};

type LaunchpadConfig = {
  pages?: LaunchpadPage[];
  builtinToolOrder?: string[];
  priorityRules?: PriorityRule[];
  groups?: { id: string; match?: string[]; sort?: 'name' | 'none' }[];
  layout?: any;
};

export function getLaunchpadConfig(): LaunchpadConfig {
  return launchpadConfig as any;
}

function isPriority(name: string, rules: PriorityRule[]) {
  const n = String(name || '').toLowerCase();
  return rules.some((r) => {
    const v = String(r?.value || '').toLowerCase();
    if (!v) return false;
    if (r.type === 'exact') return n === v;
    if (r.type === 'includes') return n.includes(v);
    return false;
  });
}

function byDisplayName(a: LaunchpadItem, b: LaunchpadItem) {
  return getDisplayName(a.name).localeCompare(getDisplayName(b.name), 'zh-Hans-CN');
}

export function orderAndPaginateLaunchpadItems(params: {
  items: LaunchpadItem[];
  searchTerm: string;
  pageCapacity: number;
}) {
  const { items, searchTerm, pageCapacity } = params;

  const cfg = getLaunchpadConfig();
  const builtinOrder = Array.isArray(cfg.builtinToolOrder) ? cfg.builtinToolOrder.map(s => String(s || '').toLowerCase()).filter(Boolean) : [];
  const priorityRules = Array.isArray(cfg.priorityRules) ? cfg.priorityRules : [];
  const groups = Array.isArray(cfg.groups) ? cfg.groups : [];

  const pagesCfg = Array.isArray((cfg as any)?.pages) ? ((cfg as any).pages as LaunchpadPage[]) : [];

  const chunkBy = (arr: LaunchpadItem[], size: number) => {
    const out: LaunchpadItem[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const size = Math.max(4, Number(pageCapacity) || 0);

  if (searchTerm) {
    const chunks = chunkBy(items, size);
    return chunks.length ? chunks : [[]];
  }

  // Precise fixed pages mode: use cfg.pages if provided.
  if (pagesCfg.length) {
    const builtinSet = new Set(builtinOrder);

    const matchRule = (it: LaunchpadItem, rule: PageRule) => {
      const kind = String(rule?.kind || '').toLowerCase();
      const match = String(rule?.match || '').toLowerCase();
      const value = String(rule?.value || '').toLowerCase();

      const name = String(it?.name || '').toLowerCase();
      const type = String(it?.type || '').toLowerCase();

      const base = (() => {
        if (kind === 'any') return '';
        if (kind === 'type') return type;
        if (kind === 'name') return name;
        if (kind === 'builtin') {
          return builtinSet.has(name) ? name : '';
        }
        return '';
      })();

      if (match === 'always') return true;
      if (!base) return false;
      if (match === 'exact') return base === value;
      if (match === 'includes') return base.includes(value);
      return false;
    };

    const anyMatch = (it: LaunchpadItem, rules?: PageRule[]) => {
      const rr = Array.isArray(rules) ? rules : [];
      if (!rr.length) return false;
      return rr.some(r => matchRule(it, r));
    };

    const requireOk = (it: LaunchpadItem, rules?: PageRule[]) => {
      const rr = Array.isArray(rules) ? rules : [];
      if (!rr.length) return true;
      // OR semantics: if any of the require rules match, we accept.
      return rr.some(r => matchRule(it, r));
    };

    const remaining = [...items];
    const outPages: LaunchpadItem[][] = [];

    for (const p of pagesCfg) {
      const includeRules = Array.isArray(p?.include) ? p.include : [];
      const excludeRules = Array.isArray(p?.exclude) ? p.exclude : [];
      const requireRules = Array.isArray(p?.require) ? p.require : [];

      const candidates = remaining.filter((it) => {
        const included = includeRules.length ? anyMatch(it, includeRules) : false;
        if (!included) return false;
        if (!requireOk(it, requireRules)) return false;
        if (excludeRules.length && anyMatch(it, excludeRules)) return false;
        return true;
      });

      // Remove selected from remaining (avoid duplicates across pages)
      if (candidates.length) {
        const used = new Set(candidates.map(c => String(c.name || '').toLowerCase()));
        for (let i = remaining.length - 1; i >= 0; i -= 1) {
          const n = String(remaining[i]?.name || '').toLowerCase();
          if (used.has(n)) remaining.splice(i, 1);
        }
      }

      const sortMode = String(p?.sort || 'none');
      if (sortMode === 'name') {
        candidates.sort(byDisplayName);
      }

      const overflow = String(p?.overflow || 'split');
      if (overflow === 'truncate') {
        outPages.push(candidates.slice(0, size));
      } else {
        const chunks = chunkBy(candidates, size);
        if (chunks.length) outPages.push(...chunks);
        else outPages.push([]);
      }
    }

    // Anything not matched by pages goes to extra pages (append, split)
    if (remaining.length) {
      remaining.sort(byDisplayName);
      outPages.push(...chunkBy(remaining, size));
    }

    return outPages.length ? outPages : [[]];
  }

  const builtinSet = new Set(builtinOrder);
  const builtinTools: LaunchpadItem[] = [];
  const rest: LaunchpadItem[] = [];

  for (const it of items) {
    const n = String(it?.name || '').toLowerCase();
    if (builtinSet.has(n)) builtinTools.push(it);
    else rest.push(it);
  }

  builtinTools.sort((a, b) => builtinOrder.indexOf(String(a.name || '').toLowerCase()) - builtinOrder.indexOf(String(b.name || '').toLowerCase()));

  const priority: LaunchpadItem[] = [];
  const nonPriority: LaunchpadItem[] = [];
  for (const it of rest) {
    if (isPriority(it.name, priorityRules)) priority.push(it);
    else nonPriority.push(it);
  }

  // Grouping
  const groupBuckets = new Map<string, LaunchpadItem[]>();
  for (const g of groups) {
    groupBuckets.set(String(g.id || ''), []);
  }

  const defaultGroupId = groups.find(g => Array.isArray(g.match) && g.match.length === 0)?.id;

  const assignGroup = (it: LaunchpadItem) => {
    const name = String(it?.name || '').toLowerCase();
    for (const g of groups) {
      const m = Array.isArray(g.match) ? g.match : [];
      if (!m.length) continue;
      if (m.some(x => name.includes(String(x || '').toLowerCase()))) return String(g.id || '');
    }
    return String(defaultGroupId || '');
  };

  for (const it of nonPriority) {
    const gid = assignGroup(it);
    if (!gid) continue;
    const arr = groupBuckets.get(gid);
    if (arr) arr.push(it);
  }

  for (const g of groups) {
    const gid = String(g.id || '');
    const arr = groupBuckets.get(gid);
    if (!arr) continue;
    if (g.sort === 'name') arr.sort(byDisplayName);
  }

  // Pagination order: priority+core group first, then builtin tools + tools group, then qq group, etc.
  // We keep the group order as declared in JSON.
  const pages: LaunchpadItem[][] = [];

  const emitPages = (list: LaunchpadItem[]) => {
    if (!list.length) return;
    pages.push(...chunkBy(list, size));
  };

  // First group gets priority prepended
  if (groups.length) {
    const first = groups[0];
    const firstArr = groupBuckets.get(String(first.id || '')) || [];
    emitPages([...priority, ...firstArr]);

    // Tools page: builtinTools + group id 'tools' if exists
    for (let i = 1; i < groups.length; i += 1) {
      const g = groups[i];
      const arr = groupBuckets.get(String(g.id || '')) || [];
      if (String(g.id || '') === 'tools') {
        emitPages([...builtinTools, ...arr]);
      } else {
        emitPages(arr);
      }
    }
  } else {
    // No groups configured, just do builtin first then rest.
    const all = [...builtinTools, ...priority, ...nonPriority];
    all.sort(byDisplayName);
    emitPages(all);
  }

  return pages.length ? pages : [[]];
}
