(function () {
  const ZOOMS = {
    day: { key: "day", spanDays: 21 },
    week: { key: "week", spanDays: 56 },
    month: { key: "month", spanDays: 365 },
    year: { key: "year", spanDays: 365 * 3 },
    all: { key: "all", spanDays: null }
  };

  const PALETTE = [
    "#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7",
    "#56B4E9", "#F0E442", "#111827", "#4C9A2A", "#8B5CF6",
    "#0EA5E9", "#DC2626"
  ];

  const LEVELS = [
    { key: "level1", level: 1, label: "Niveau 1", required: true },
    { key: "level2", level: 2, label: "Niveau 2", required: false },
    { key: "level3", level: 3, label: "Niveau 3", required: false }
  ];

  const FIELD_LABELS = {
    level: "Niveau",
    name: "Nom",
    start: "Début",
    end: "Fin",
    status: "Statut",
    responsible: "Responsable",
    progress: "Avancement",
    sourceTable: "Table source"
  };

  const TODAY_POSITION_RATIO = 1 / 10;
  const NAVIGATION_STEP_RATIO = 1 / 24;
  const DAY_VIEW_CELL_WIDTH = 32;

  const STORAGE_KEY = "grist_gantt_multilevel_state_v1";
  const WIDGET_STATE_OPTION_KEY = "uiState";
  const DIRECT_MAPPING_OPTION_KEY = "directMapping";
  const DIRECT_MAPPING_STORAGE_KEY = "grist_gantt_direct_multitable_mapping_v1";
  const DIRECT_FIELDS = ["name", "start", "end", "status", "responsible", "progress"];
  const DIRECT_FIELD_AUTOMAP_LABELS = {
    name: ["Titre"],
    start: ["DateDebut"],
    end: ["DateFin"],
    status: ["Statut"],
    responsible: ["Responsable"],
    progress: ["Avancement"]
  };
  const TABLE_DEFAULT_VISIBLE_FIELDS = ["name", "start", "end", "status", "responsible", "progress"];
  const TABLE_FIELD_WIDTHS = {
    name: "30%",
    start: "130px",
    end: "130px",
    status: "150px",
    responsible: "170px",
    progress: "120px"
  };

  let zoomMode = "day";
  let allRecords = [];
  let treeRoots = [];
  let flatTracks = [];
  let nodeById = new Map();
  let expandedNodes = {};
  let globalMinDate = null;
  let globalMaxDate = null;
  let visibleStart = null;
  let visibleEnd = null;
  let colorField = "level";
  let labelsVisible = true;
  let compactChildren = false;
  let allowEditing = false;
  let viewMode = "timeline";
  let timelineSortField = "default";
  let tableVisibleFields = [...TABLE_DEFAULT_VISIBLE_FIELDS];
  let tableColumnFilters = {};
  let openTableFilterField = null;
  let currentTableId = null;
  let currentViewRecords = null;
  let latestWriteSummary = "docApi.applyUserActions (mapping interne)";
  let selectedNodeId = null;
  let directMappingConfig = loadDirectMappingConfig();
  let directMappingModeActive = hasDirectMappingConfig(directMappingConfig);
  let sourceColumnMetaPromise = null;
  const sourceColumnMetaCache = new Map();
  const tableMetaCache = new Map();
  const refOptionsCache = new Map();
  const sourceTableRowsCache = new Map();
  let directHierarchyDirty = true;
  let directHierarchyConstraintSignature = null;
  const tooltipState = { nodeId: null, editingField: null, draftValue: null, forceRefresh: false };
  let tooltipHideTimer = null;

  const mappingInfoEl = document.getElementById("mappingInfo");
  const debugStatusEl = document.getElementById("debugStatus");
  const debugSyncModeEl = document.getElementById("debugSyncMode");
  const debugActionEl = document.getElementById("debugAction");
  const taskListEl = document.getElementById("taskList");
  const timelineGridEl = document.getElementById("timelineGrid");
  const yearsRowEl = document.getElementById("yearsRow");
  const monthsRowEl = document.getElementById("monthsRow");
  const weeksRowEl = document.getElementById("weeksRow");
  const daysRowEl = document.getElementById("daysRow");
  const timelineHeaderEl = document.getElementById("timelineHeader");
  const timelineBodyEl = document.getElementById("timelineBody");
  const currentPeriodEl = document.getElementById("currentPeriod");
  const colorFieldSelect = document.getElementById("colorFieldSelect");
  const toastContainer = document.getElementById("toastContainer");
  const tooltipEl = document.getElementById("tooltip");
  const ttStartEl = document.getElementById("ttStart");
  const ttEndEl = document.getElementById("ttEnd");
  const ttExtraEl = document.getElementById("ttExtra");
  const dragBubbleEl = document.getElementById("dragBubble");
  const taskCountEl = document.getElementById("taskCount");
  const expandAllBtn = document.getElementById("expandAllBtn");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const todayBtn = document.getElementById("todayBtn");
  const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
  const toggleLabelsBtn = document.getElementById("toggleLabelsBtn");
  const groupChildrenBtn = document.getElementById("groupChildrenBtn");
  const toggleDateEditBtn = document.getElementById("toggleDateEditBtn");
  const ganttContainer = document.getElementById("ganttContainer");
  const toggleMappingPanelBtn = document.getElementById("toggleMappingPanelBtn");
  const mappingPanelEl = document.getElementById("mappingPanel");
  const debugPanelEl = document.getElementById("debugPanel");
  const timelineViewBtn = document.getElementById("timelineViewBtn");
  const tableViewBtn = document.getElementById("tableViewBtn");
  const addLevel1Btn = document.getElementById("addLevel1Btn");
  const tableViewEl = document.getElementById("tableView");
  const hierarchyTableWrapEl = document.getElementById("hierarchyTableWrap");
  const tableAddLevel1Btn = document.getElementById("tableAddLevel1Btn");
  const tableExpandAllBtn = document.getElementById("tableExpandAllBtn");
  const tableToggleEditBtn = document.getElementById("tableToggleEditBtn");
  const timelineDateSortSelect = document.getElementById("timelineDateSortSelect");
  const tableToolbarActionsEl = document.getElementById("tableToolbarActions");
  const tableFieldPickerEl = document.getElementById("tableFieldPicker");
  const tableFieldSelectBtn = document.getElementById("tableFieldSelectBtn");
  const tableFieldSelect = document.getElementById("tableFieldSelect");
  const zoomControlsEl = document.querySelector(".zoom-controls");

  const dragState = {
    active: false,
    type: null,
    bar: null,
    milestone: null,
    nodeId: null,
    originalStart: null,
    originalEnd: null,
    originalMilestoneDate: null,
    startX: 0,
    pxPerDay: 0
  };

  const TIMELINE_ROW_HEIGHT = 34;
  const TABLE_ROW_HEIGHT = 35;
  const VIRTUAL_OVERSCAN_ROWS = 8;
  let syncingTimelineScroll = false;
  let timelineScrollListenersReady = false;

  function verticalScrollContainer(el) {
    const ganttBody = ganttContainer?.querySelector(".gantt-body");
    if (el === taskListEl || el === timelineBodyEl) return ganttBody || el;
    return el;
  }

  function visibleRangeForContainer(el, totalRows, rowHeight, overscan = VIRTUAL_OVERSCAN_ROWS) {
    const scrollEl = verticalScrollContainer(el);
    const scrollTop = Math.max(0, scrollEl?.scrollTop || 0);
    const viewportHeight = scrollEl?.clientHeight || window.innerHeight || rowHeight * 20;
    const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    const end = Math.min(totalRows, first + visibleCount);
    return {
      start: first,
      end,
      topSpacer: first * rowHeight,
      bottomSpacer: Math.max(0, (totalRows - end) * rowHeight)
    };
  }

  function createVerticalSpacer(height) {
    const spacer = document.createElement("div");
    spacer.className = "virtual-spacer";
    spacer.style.height = `${height}px`;
    spacer.style.flex = `0 0 ${height}px`;
    return spacer;
  }

  function syncTimelineScroll(sourceEl) {
    if (syncingTimelineScroll) return;
    syncingTimelineScroll = true;
    const source = verticalScrollContainer(sourceEl);
    for (const el of [taskListEl, timelineBodyEl]) {
      const target = verticalScrollContainer(el);
      if (target && target !== source) target.scrollTop = source?.scrollTop || 0;
    }
    syncingTimelineScroll = false;
  }

  function scheduleTimelineVirtualRender() {
    if (viewMode !== "timeline") return;
    window.requestAnimationFrame(() => {
      TimelineView.renderTaskList();
      TimelineView.renderTimeline();
    });
  }

  function ensureTimelineScrollSync() {
    if (timelineScrollListenersReady) return;
    timelineScrollListenersReady = true;
    const ganttBody = ganttContainer?.querySelector(".gantt-body");
    for (const el of new Set([ganttBody, taskListEl, timelineBodyEl].filter(Boolean))) {
      el.addEventListener("scroll", () => {
        syncTimelineScroll(el);
        scheduleTimelineVirtualRender();
      }, { passive: true });
    }
  }

  function setDebugStatus(message) {
    if (debugStatusEl) debugStatusEl.textContent = message;
  }

  function setDebugAction(message) {
    if (debugActionEl) debugActionEl.textContent = message;
  }

  function setDebugSyncMode(message) {
    latestWriteSummary = message;
    if (debugSyncModeEl) debugSyncModeEl.textContent = message;
  }

  function serializedState() {
    return {
      zoomMode,
      colorField,
      labelsVisible,
      compactChildren,
      allowEditing,
      viewMode,
      selectedViewMode: viewMode,
      timelineSortField,
      tableVisibleFields,
      tableColumnFilters,
      expandedNodes,
      visibleStart: visibleStart ? toGristDateString(visibleStart) : null,
      visibleEnd: visibleEnd ? toGristDateString(visibleEnd) : null
    };
  }

  function applyState(s, options = {}) {
    if (!s || typeof s !== "object") return;
    const { includeViewMode = true } = options;
    if (s.zoomMode) zoomMode = s.zoomMode;
    if (s.colorField) colorField = s.colorField;
    if (typeof s.labelsVisible === "boolean") labelsVisible = s.labelsVisible;
    if (typeof s.compactChildren === "boolean") compactChildren = s.compactChildren;
    if (typeof s.allowEditing === "boolean") allowEditing = s.allowEditing;
    else if (typeof s.allowTimelineDateEdit === "boolean") allowEditing = s.allowTimelineDateEdit;
    const savedViewMode = s.selectedViewMode || s.viewMode;
    if (includeViewMode && (savedViewMode === "table" || savedViewMode === "timeline")) viewMode = savedViewMode;
    const savedTimelineSortField = s.timelineSortField || s.tableSortField;
    if (isValidDateSortField(savedTimelineSortField)) timelineSortField = savedTimelineSortField;
    if (Array.isArray(s.tableVisibleFields)) tableVisibleFields = sanitizeTableVisibleFields(s.tableVisibleFields);
    if (s.tableColumnFilters && typeof s.tableColumnFilters === "object") tableColumnFilters = sanitizeTableColumnFilters(s.tableColumnFilters);
    if (s.expandedNodes && typeof s.expandedNodes === "object") expandedNodes = s.expandedNodes;
    if (s.visibleStart) visibleStart = normalizeDate(s.visibleStart);
    if (s.visibleEnd) visibleEnd = normalizeDate(s.visibleEnd);
  }

  function saveStateToLocalStorage(state) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      // La vue active est volontairement exclue du repli localStorage : cette clé est
      // commune à toutes les instances qui utilisent la même URL. La vue est restaurée
      // via les options Grist propres à chaque widget inséré.
      applyState(JSON.parse(raw), { includeViewMode: false });
    } catch (e) {
      console.warn("Impossible de charger l’état persistant :", e);
    }
  }

  function createEmptyDirectLevelConfig() {
    return { tableId: "", parentCol: "", nameCol: "", startCol: "", endCol: "", statusCol: "", responsibleCol: "", progressCol: "", extraFields: [] };
  }

  function normalizeDirectMappingConfig(config) {
    const normalized = { levels: {} };
    for (const levelInfo of LEVELS) {
      const existing = config?.levels?.[levelInfo.level] || {};
      normalized.levels[levelInfo.level] = normalizeDirectLevelConfig(existing, levelInfo.level);
    }
    return normalized;
  }


  function normalizeExtraField(field, level, index) {
    const id = String(field?.id || `extra_${level}_${Date.now()}_${index}`).replace(/[^a-zA-Z0-9_-]/g, "_");
    return { id, label: String(field?.label || "").trim(), colId: String(field?.colId || "") };
  }

  function normalizeDirectLevelConfig(existing, level) {
    const cfg = { ...createEmptyDirectLevelConfig(), ...existing };
    cfg.extraFields = Array.isArray(existing?.extraFields)
      ? existing.extraFields.map((field, index) => normalizeExtraField(field, level, index)).filter((field) => field.id)
      : [];
    return cfg;
  }

  function normalizeAutomapText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();
  }

  function columnsForTable(tableId, { writableOnly = true } = {}) {
    return Array.from(sourceColumnMetaCache.values())
      .filter((col) => col.tableId === tableId && (!writableOnly || !col.isFormula));
  }

  function findAutomapColumn(tableId, labels, options = {}) {
    const wanted = new Set(labels.map(normalizeAutomapText));
    return columnsForTable(tableId, options)
      .filter((col) => !options.onlyTypes || options.onlyTypes.includes(baseGristType(col.type)))
      .find((col) => wanted.has(normalizeAutomapText(col.label)) || wanted.has(normalizeAutomapText(col.colId))) || null;
  }

  function automapDirectLevelConfig(cfg) {
    if (!cfg?.tableId) return false;
    let changed = false;
    for (const field of DIRECT_FIELDS) {
      const key = `${field}Col`;
      if (cfg[key]) continue;
      const onlyTypes = field === "start" || field === "end" ? ["Date", "DateTime"] : null;
      const col = findAutomapColumn(cfg.tableId, DIRECT_FIELD_AUTOMAP_LABELS[field] || [], { onlyTypes });
      if (col) {
        cfg[key] = col.colId;
        changed = true;
      }
    }
    return changed;
  }

  function fieldKeyForExtra(extra) {
    return `extra:${extra.id}`;
  }

  function parseExtraFieldKey(field) {
    return String(field || "").startsWith("extra:") ? String(field).slice(6) : null;
  }

  function extraFieldConfigForNode(node, field) {
    const extraId = parseExtraFieldKey(field);
    if (!extraId || !node) return null;
    return node.extraFields?.[extraId] || null;
  }

  function extraFieldDefinitionsForLevel(level) {
    const cfg = directMappingConfig.levels[level];
    return (cfg?.extraFields || []).filter((field) => field.label && field.colId);
  }

  function allTableFieldDefs() {
    const defaults = [
      { field: "name", label: "Élément", width: TABLE_FIELD_WIDTHS.name },
      { field: "start", label: "Début", width: TABLE_FIELD_WIDTHS.start },
      { field: "end", label: "Fin", width: TABLE_FIELD_WIDTHS.end },
      { field: "status", label: "Statut", width: TABLE_FIELD_WIDTHS.status },
      { field: "responsible", label: "Responsable", width: TABLE_FIELD_WIDTHS.responsible },
      { field: "progress", label: "Avancement", width: TABLE_FIELD_WIDTHS.progress }
    ];
    const extras = [];
    const seen = new Set(defaults.map((def) => def.field));
    for (const levelInfo of LEVELS) {
      for (const extra of extraFieldDefinitionsForLevel(levelInfo.level)) {
        const field = fieldKeyForExtra(extra);
        if (seen.has(field)) continue;
        seen.add(field);
        extras.push({ field, label: extra.label, width: "150px", level: levelInfo.level });
      }
    }
    return [...defaults, ...extras];
  }

  function sanitizeTableVisibleFields(fields = tableVisibleFields) {
    const available = allTableFieldDefs().map((def) => def.field);
    const selected = fields.filter((field) => available.includes(field));
    return selected.length ? selected : [...TABLE_DEFAULT_VISIBLE_FIELDS].filter((field) => available.includes(field));
  }

  function isTableFilterableField(field) {
    return field !== "start" && field !== "end" && field !== "progress";
  }

  function sanitizeTableColumnFilters(filters = tableColumnFilters) {
    const available = new Set(allTableFieldDefs().map((def) => def.field).filter(isTableFilterableField));
    const normalized = {};
    for (const [field, values] of Object.entries(filters || {})) {
      if (!available.has(field) || !Array.isArray(values)) continue;
      const cleanValues = Array.from(new Set(values.map((value) => String(value))));
      if (cleanValues.length) normalized[field] = cleanValues;
    }
    return normalized;
  }

  function hasActiveTableFilters() {
    return Object.values(tableColumnFilters || {}).some((values) => Array.isArray(values) && values.length);
  }

  function pruneHiddenTableFilters() {
    const visible = new Set(tableVisibleFields);
    for (const field of Object.keys(tableColumnFilters || {})) {
      if (!visible.has(field)) delete tableColumnFilters[field];
    }
  }

  function loadDirectMappingConfigFromLocalStorage() {
    try {
      const raw = window.localStorage.getItem(DIRECT_MAPPING_STORAGE_KEY);
      return raw ? normalizeDirectMappingConfig(JSON.parse(raw)) : normalizeDirectMappingConfig({});
    } catch (e) {
      console.warn("Impossible de charger le mapping interne multitable depuis localStorage :", e);
      return normalizeDirectMappingConfig({});
    }
  }

  function loadDirectMappingConfig() {
    return loadDirectMappingConfigFromLocalStorage();
  }

  function saveDirectMappingConfigToLocalStorage(config = directMappingConfig) {
    try {
      window.localStorage.setItem(DIRECT_MAPPING_STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn("Impossible de sauvegarder le mapping interne multitable dans localStorage :", e);
    }
  }

  function saveDirectMappingConfigOption(config = directMappingConfig) {
    if (!window.grist || typeof grist.setOption !== "function") return;
    grist.setOption(DIRECT_MAPPING_OPTION_KEY, config)
      .catch((e) => console.warn("Impossible de sauvegarder le mapping interne dans les options Grist :", e));
  }

  function saveDirectMappingConfig() {
    clearAllSourceTableRowsCache("configuration du mapping");
    saveDirectMappingConfigToLocalStorage(directMappingConfig);
    saveDirectMappingConfigOption(directMappingConfig);
  }

  function hasDirectMappingConfig(config) {
    return LEVELS.some((levelInfo) => !!config?.levels?.[levelInfo.level]?.tableId);
  }

  function saveWidgetStateOption(state) {
    if (!window.grist || typeof grist.setOption !== "function") return;
    grist.setOption(WIDGET_STATE_OPTION_KEY, state)
      .catch((e) => console.warn("Impossible de sauvegarder l’état propre au widget Grist :", e));
  }

  function saveState() {
    const state = serializedState();
    try {
      saveStateToLocalStorage(state);
    } catch (e) {
      console.warn("Impossible de sauvegarder l’état persistant :", e);
    }
    saveWidgetStateOption(state);
  }

  loadState();

  function normalizeDate(value) {
    if (!value) return null;
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    if (typeof value === "number") {
      const d = new Date(value * 1000);
      return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(date, n) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  function addMonths(date, n) {
    const d = new Date(date.getTime());
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return d;
  }

  function diffInDays(a, b) {
    const da = normalizeDate(a);
    const db = normalizeDate(b);
    return Math.round((db - da) / 86400000);
  }

  function startOfYear(date) { return new Date(date.getFullYear(), 0, 1); }
  function endOfYear(date) { return new Date(date.getFullYear(), 11, 31); }
  function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }
  function isSameDay(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  function formatDate(d) {
    if (!d) return "–";
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatDateShort(d) {
    if (!d) return "–";
    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
  }

  function toGristDateString(d) {
    if (!d) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function isoWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  function cleanRecordForUpdate(obj) {
    const out = {};
    for (const [key, value] of Object.entries(obj || {})) {
      if (value !== undefined && key !== "id") out[key] = value;
    }
    return out;
  }

  function hashStringToInt(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function showToast(message, type = "info") {
    if (!toastContainer) return;
    const el = document.createElement("div");
    el.className = "toast " + (type === "success" ? "success" : type === "error" ? "error" : "");
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  function showDragBubble(html, x, y) {
    if (!dragBubbleEl) return;
    dragBubbleEl.innerHTML = html;
    dragBubbleEl.style.left = x + "px";
    dragBubbleEl.style.top = y + "px";
    dragBubbleEl.classList.add("visible");
  }

  function hideDragBubble() {
    if (dragBubbleEl) dragBubbleEl.classList.remove("visible");
  }

  function coalesce(...values) {
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return null;
  }

  function mappedEntry(mapped, aliases) {
    for (const alias of aliases || []) {
      if (Object.prototype.hasOwnProperty.call(mapped, alias) && mapped[alias] !== undefined && mapped[alias] !== null && String(mapped[alias]).trim() !== "") {
        return { alias, value: mapped[alias] };
      }
    }
    return { alias: null, value: null };
  }

  function mappedValue(mapped, aliases) {
    return mappedEntry(mapped, aliases).value;
  }

  function hasLevelSpecificSource(sourceEntries, level) {
    return !!(sourceEntries?.rowId?.alias && sourceEntries.rowId.alias.startsWith(`level${level}`));
  }

  function isGristList(value) {
    return Array.isArray(value) && value[0] === "L";
  }

  function looksLikeSingleRefTuple(value) {
    return Array.isArray(value) && value.length >= 1 && value.length <= 3 && !isGristList(value) && !Array.isArray(value[0]) &&
      !(typeof value[0] === "object" && value[0] !== null) &&
      (value.length === 1 || value[1] == null || typeof value[1] === "string") &&
      (value.length < 3 || value[2] == null || typeof value[2] === "string");
  }

  function splitListValue(value) {
    if (!Array.isArray(value)) return [value];
    if (!value.length) return [];
    if (isGristList(value)) return value.slice(1);
    if (looksLikeSingleRefTuple(value)) return [value];
    if (Array.isArray(value[0]) || (typeof value[0] === "object" && value[0] !== null)) return value;
    return value;
  }

  function valueAtListIndex(value, index, listLength) {
    if (value == null || listLength <= 1) return value;
    const values = splitListValue(value);
    if (values.length === listLength) return values[index];
    return value;
  }

  function parseRefValue(value) {
    if (value == null) return { label: "", rowId: null, tableId: null };
    if (Array.isArray(value)) {
      if (!value.length) return { label: "", rowId: null, tableId: null };
      if (isGristList(value)) return parseRefValue(value[1]);
      if (Array.isArray(value[0]) || (typeof value[0] === "object" && value[0] !== null)) return parseRefValue(value[0]);
      const rowId = Number(value[0]);
      return {
        label: value[1] != null ? String(value[1]) : String(value[0] ?? ""),
        rowId: Number.isFinite(rowId) ? rowId : null,
        tableId: value[2] != null ? String(value[2]) : null
      };
    }
    if (typeof value === "object") {
      const rowId = Number(value.id ?? value.rowId ?? value.Ref ?? value.ref);
      const label = value.label ?? value.name ?? value.displayValue ?? value.value ?? value.title ?? value.id ?? "";
      const tableId = value.tableId ?? value.table ?? value.tableName ?? null;
      return { label: String(label || ""), rowId: Number.isFinite(rowId) ? rowId : null, tableId: tableId ? String(tableId) : null };
    }
    return { label: String(value), rowId: Number.isFinite(Number(value)) ? Number(value) : null, tableId: null };
  }

  function parseRefValues(value) {
    return splitListValue(value).map(parseRefValue).filter((ref) => (ref.label || "").trim());
  }

  function displayValueForField(value) {
    const refs = parseRefValues(value);
    if (refs.length) return refs.map((ref) => ref.label).join(", ");
    return value == null ? "" : String(value);
  }

  function rawValueForField(node, field) {
    return node?.fieldRawValues && Object.prototype.hasOwnProperty.call(node.fieldRawValues, field)
      ? node.fieldRawValues[field]
      : fieldDisplayValue(node, field);
  }

  function parseProgress(value) {
    if (value == null || value === "") return null;
    if (typeof value === "string") {
      const cleaned = value.replace("%", "").replace(",", ".").trim();
      if (!cleaned) return null;
      const n = Number(cleaned);
      if (!Number.isFinite(n)) return null;
      return Math.max(0, Math.min(100, n <= 1 && !value.includes("%") ? n * 100 : n));
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, n <= 1 ? n * 100 : n));
  }

  function makeNodeId(level, parts, refInfo, source, sourceEntries) {
    const pathId = `L${level}:path:${parts.map((p) => String(p || "").trim()).join("›")}`;
    const hasStableLevelSource = hasLevelSpecificSource(sourceEntries, level);
    if (hasStableLevelSource && source.tableId && source.rowId != null) return `L${level}:src:${source.tableId}:${source.rowId}`;
    if (refInfo && refInfo.tableId && refInfo.rowId != null) return `L${level}:ref:${refInfo.tableId}:${refInfo.rowId}`;
    if (refInfo && refInfo.rowId != null) return `L${level}:ref:${refInfo.rowId}`;
    return pathId;
  }

  function normalizedHierarchyLabel(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("fr");
  }

  function groupingKey(node) {
    return `${node.level}::${node.parentId || ""}::${normalizedHierarchyLabel(node.label)}`;
  }

  function earliestDate(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return a < b ? a : b;
  }

  function latestDate(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return a > b ? a : b;
  }

  function mergeDuplicateNodeData(target, duplicate) {
    for (const rowId of duplicate.rawRows) {
      if (!target.rawRows.includes(rowId)) target.rawRows.push(rowId);
    }
    if (duplicate.sourceIndex < target.sourceIndex) target.sourceIndex = duplicate.sourceIndex;
    if (!target.firstDisplayRowId && duplicate.firstDisplayRowId) target.firstDisplayRowId = duplicate.firstDisplayRowId;

    target.startDate = earliestDate(target.startDate, duplicate.startDate);
    target.endDate = latestDate(target.endDate, duplicate.endDate);
    target.explicitDates = target.explicitDates || duplicate.explicitDates;
    if (!target.status && duplicate.status) target.status = duplicate.status;
    if (!target.responsible && duplicate.responsible) target.responsible = duplicate.responsible;
    if (target.progress == null && duplicate.progress != null) target.progress = duplicate.progress;
    target.fieldRawValues = { ...(duplicate.fieldRawValues || {}), ...(target.fieldRawValues || {}) };
    if (target.order == null || (duplicate.order != null && duplicate.order < target.order)) target.order = duplicate.order;

    target.source = {
      tableId: target.source.tableId || duplicate.source.tableId || null,
      rowId: target.source.rowId != null ? target.source.rowId : duplicate.source.rowId,
      startCol: target.source.startCol || duplicate.source.startCol || null,
      endCol: target.source.endCol || duplicate.source.endCol || null,
      progressCol: target.source.progressCol || duplicate.source.progressCol || null,
      nameCol: target.source.nameCol || duplicate.source.nameCol || null,
      statusCol: target.source.statusCol || duplicate.source.statusCol || null,
      responsibleCol: target.source.responsibleCol || duplicate.source.responsibleCol || null,
      parentCol: target.source.parentCol || duplicate.source.parentCol || null,
      extraCols: { ...(duplicate.source.extraCols || {}), ...(target.source.extraCols || {}) }
    };
    target.fallbackAliases = target.fallbackAliases || duplicate.fallbackAliases;
  }

  function dedupeHierarchySiblings(siblings, nodes) {
    const unique = [];
    const byKey = new Map();

    for (const node of siblings) {
      const key = groupingKey(node);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, node);
        unique.push(node);
        continue;
      }

      mergeDuplicateNodeData(existing, node);
      for (const child of node.children) {
        child.parentId = existing.id;
        existing.children.push(child);
      }
      nodes.delete(node.id);
    }

    for (const node of unique) {
      node.children = dedupeHierarchySiblings(node.children, nodes);
    }

    return unique;
  }

  function createEmptyNode({ id, level, label, parentId, sourceIndex, sourceRowId, source }) {
    return {
      id,
      level,
      label: label || `(Niveau ${level} sans nom)`,
      parentId: parentId || null,
      children: [],
      sourceIndex,
      firstDisplayRowId: sourceRowId,
      startDate: null,
      endDate: null,
      aggStart: null,
      aggEnd: null,
      explicitDates: false,
      isMilestone: false,
      milestoneDate: null,
      status: "",
      responsible: "",
      progress: null,
      order: null,
      source: source || {},
      fallbackAliases: {},
      rawRows: [],
      fieldRawValues: {}
    };
  }

  function mergeNodeData(node, data) {
    if (!node.rawRows.includes(data.displayRowId)) node.rawRows.push(data.displayRowId);
    if (data.sourceIndex < node.sourceIndex) node.sourceIndex = data.sourceIndex;
    if (!node.firstDisplayRowId && data.displayRowId) node.firstDisplayRowId = data.displayRowId;

    if (data.startDate || data.endDate) {
      node.startDate = data.startDate || node.startDate;
      node.endDate = data.endDate || node.endDate;
      node.explicitDates = true;
    }
    if (!node.status && data.status) node.status = data.status;
    if (!node.responsible && data.responsible) node.responsible = data.responsible;
    if (node.progress == null && data.progress != null) node.progress = data.progress;
    node.fieldRawValues = { ...(node.fieldRawValues || {}), ...(data.fieldRawValues || {}) };
    if (node.order == null && data.order != null) node.order = data.order;

    node.source = {
      tableId: node.source.tableId || data.source.tableId || null,
      rowId: node.source.rowId != null ? node.source.rowId : data.source.rowId,
      startCol: node.source.startCol || data.source.startCol || null,
      endCol: node.source.endCol || data.source.endCol || null,
      progressCol: node.source.progressCol || data.source.progressCol || null,
      nameCol: node.source.nameCol || data.source.nameCol || null,
      statusCol: node.source.statusCol || data.source.statusCol || null,
      responsibleCol: node.source.responsibleCol || data.source.responsibleCol || null,
      parentCol: node.source.parentCol || data.source.parentCol || null
    };
    node.fallbackAliases = data.fallbackAliases || node.fallbackAliases;
  }

  function sortNodes(a, b) {
    const ao = a.order != null ? a.order : Infinity;
    const bo = b.order != null ? b.order : Infinity;
    if (ao !== bo) return ao - bo;
    return sourceOrderComparison(a, b);
  }

  function sourceOrderComparison(a, b) {
    return (a.sourceIndex ?? Infinity) - (b.sourceIndex ?? Infinity) || a.label.localeCompare(b.label, "fr");
  }

  function isValidDateSortField(value) {
    return value === "default" || /^date(?:Start|End)[1-3]$/.test(value || "");
  }

  function computeGlobalRange(nodes) {
    let min = null;
    let max = null;
    for (const n of nodes) {
      for (const d of [n.startDate, n.endDate, n.aggStart, n.aggEnd, n.milestoneDate]) {
        if (!d) continue;
        if (!min || d < min) min = d;
        if (!max || d > max) max = d;
      }
    }
    return { min, max };
  }

  function isNodeExpanded(node) {
    if (!node.children.length) return false;
    return expandedNodes[node.id] !== false;
  }

  function buildTracks() {
    const tracks = [];
    function walk(node) {
      const children = sortedTimelineChildren(node);
      tracks.push({ kind: "node", node });
      if (!isNodeExpanded(node)) return;
      if (compactChildren && children.length && children.every((c) => !c.children.length)) {
        tracks.push({ kind: "compact", parent: node, nodes: children });
      } else {
        children.forEach(walk);
      }
    }
    [...treeRoots].sort(compareNodesForTimeline).forEach(walk);
    flatTracks = tracks;
    return tracks;
  }

  function getNavigationBounds() {
    if (!globalMinDate || !globalMaxDate) return { minAllowed: null, maxAllowed: null };
    const today = normalizeDate(new Date());
    const minDate = today && today < globalMinDate ? today : globalMinDate;
    const maxDate = today && today > globalMaxDate ? today : globalMaxDate;
    if (zoomMode === "all") {
      return {
        minAllowed: new Date(minDate.getFullYear() - 2, 0, 1),
        maxAllowed: new Date(maxDate.getFullYear() + 2, 11, 31)
      };
    }
    const fullSpan = diffInDays(minDate, maxDate) + 1;
    const requested = ZOOMS[zoomMode]?.spanDays || fullSpan;
    const marginDays = Math.max(15, requested);
    return { minAllowed: addDays(minDate, -marginDays), maxAllowed: addDays(maxDate, marginDays) };
  }

  function positionRangeAroundToday(span) {
    const today = normalizeDate(new Date());
    const daysBeforeToday = Math.floor(span * TODAY_POSITION_RATIO);
    const start = addDays(today, -daysBeforeToday);
    return { start, end: addDays(start, span - 1) };
  }

  function setAllZoomRangeAroundToday() {
    const today = normalizeDate(new Date());
    const minDate = today && today < globalMinDate ? today : globalMinDate;
    const maxDate = today && today > globalMaxDate ? today : globalMaxDate;
    const daysBeforeData = Math.max(0, diffInDays(minDate, today));
    const daysAfterData = Math.max(0, diffInDays(today, maxDate));
    const minSpanForTodayOffset = Math.ceil((daysBeforeData + 1) / TODAY_POSITION_RATIO);
    const minSpanForDataAfterToday = Math.ceil((daysAfterData + 1) / (1 - TODAY_POSITION_RATIO));
    const dataSpan = diffInDays(minDate, maxDate) + 1;
    const span = Math.max(dataSpan, minSpanForTodayOffset, minSpanForDataAfterToday, 30);
    const range = positionRangeAroundToday(span);
    visibleStart = range.start;
    visibleEnd = range.end;
  }

  function getTimelineAvailableWidth() {
    return timelineBodyEl?.clientWidth || timelineHeaderEl?.clientWidth || 800;
  }

  function getDayZoomSpan() {
    return Math.max(1, Math.floor(getTimelineAvailableWidth() / DAY_VIEW_CELL_WIDTH));
  }

  function getZoomSpan() {
    if (zoomMode === "day") return getDayZoomSpan();
    return ZOOMS[zoomMode]?.spanDays || 30;
  }

  function setVisibleRangeForZoom() {
    if (!globalMinDate || !globalMaxDate) {
      visibleStart = null;
      visibleEnd = null;
      return;
    }
    if (zoomMode === "all") {
      setAllZoomRangeAroundToday();
      return;
    }
    const span = getZoomSpan();
    const range = positionRangeAroundToday(span);
    let start = range.start;
    let end = range.end;
    const { minAllowed, maxAllowed } = getNavigationBounds();
    if (start < minAllowed) { start = new Date(minAllowed.getTime()); end = addDays(start, span - 1); }
    if (end > maxAllowed) { end = new Date(maxAllowed.getTime()); start = addDays(end, -span + 1); }
    visibleStart = start;
    visibleEnd = end;
  }

  function keepOrRecomputeVisibleRange() {
    if (!visibleStart || !visibleEnd) return setVisibleRangeForZoom();
    const { minAllowed, maxAllowed } = getNavigationBounds();
    if (!minAllowed || !maxAllowed) return setVisibleRangeForZoom();
    const span = zoomMode === "day" ? getDayZoomSpan() : diffInDays(visibleStart, visibleEnd) + 1;
    let start = new Date(visibleStart.getTime());
    let end = addDays(start, span - 1);
    if (start < minAllowed) { start = new Date(minAllowed.getTime()); end = addDays(start, span - 1); }
    if (end > maxAllowed) { end = new Date(maxAllowed.getTime()); start = addDays(end, -span + 1); }
    visibleStart = start;
    visibleEnd = end;
  }

  function getNavigationStepMonths() {
    if (zoomMode === "month") return 1;
    if (zoomMode === "year" || zoomMode === "all") return 3;
    return 0;
  }

  function shiftVisibleRange(direction) {
    if (!visibleStart || !visibleEnd) return;
    const span = diffInDays(visibleStart, visibleEnd) + 1;
    const monthStep = getNavigationStepMonths();
    if (monthStep) {
      visibleStart = addMonths(visibleStart, direction === "left" ? -monthStep : monthStep);
      visibleEnd = addDays(visibleStart, span - 1);
    } else {
      const step = Math.max(1, Math.round(span * NAVIGATION_STEP_RATIO));
      const delta = direction === "left" ? -step : step;
      visibleStart = addDays(visibleStart, delta);
      visibleEnd = addDays(visibleEnd, delta);
    }
    const { minAllowed, maxAllowed } = getNavigationBounds();
    if (visibleStart < minAllowed) { visibleStart = new Date(minAllowed.getTime()); visibleEnd = addDays(visibleStart, span - 1); }
    if (visibleEnd > maxAllowed) { visibleEnd = new Date(maxAllowed.getTime()); visibleStart = addDays(visibleEnd, -span + 1); }
    saveState();
    render();
  }

  function recomputeCellWidth(totalDays) {
    const bodyWidth = getTimelineAvailableWidth();
    let cellWidth = 32;
    if (zoomMode === "day") cellWidth = DAY_VIEW_CELL_WIDTH;
    else if (zoomMode === "all") cellWidth = Math.max(2, Math.min(18, Math.floor(bodyWidth / Math.max(1, totalDays))));
    else if (zoomMode === "year") cellWidth = Math.max(3, Math.min(10, Math.floor(bodyWidth / Math.max(1, totalDays))));
    else if (zoomMode === "month") cellWidth = Math.max(9, Math.min(24, Math.floor(bodyWidth / Math.max(1, totalDays))));
    else if (zoomMode === "week") cellWidth = Math.max(16, Math.min(32, Math.floor(bodyWidth / Math.max(1, totalDays))));
    document.documentElement.style.setProperty("--cell-width", cellWidth + "px");
    return { cellWidth, containerWidth: totalDays * cellWidth };
  }

  function updateZoomButtons() {
    document.querySelectorAll(".zoom-controls .btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.zoom === zoomMode));
  }

  function initColorFieldSelect() {
    const fields = ["level", "name", "status", "responsible", "progress", "sourceTable", "start", "end"];
    colorFieldSelect.innerHTML = "";
    for (const f of fields) {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = FIELD_LABELS[f] || f;
      colorFieldSelect.appendChild(opt);
    }
    if (!fields.includes(colorField)) colorField = fields[0];
    colorFieldSelect.value = colorField;
  }

  function colorValue(node) {
    if (colorField === "level") return `Niveau ${node.level}`;
    if (colorField === "name") return node.label;
    if (colorField === "status") return node.status;
    if (colorField === "responsible") return node.responsible;
    if (colorField === "progress") return node.progress == null ? "" : `${Math.round(node.progress)}%`;
    if (colorField === "sourceTable") return node.source.tableId || "";
    if (colorField === "start") return node.aggStart ? toGristDateString(node.aggStart) : "";
    if (colorField === "end") return node.aggEnd ? toGristDateString(node.aggEnd) : "";
    return node.label;
  }

  function getColorForNode(node) {
    if (colorField === "level") return node.level === 1 ? "#4f46e5" : node.level === 2 ? "#0ea5e9" : "#10b981";
    if (colorField === "status") {
      const s = String(node.status || "").trim().toLowerCase();
      if (["terminé", "termine", "done", "clos", "clôturé", "cloture"].includes(s)) return "#10b981";
      if (["en cours", "ongoing", "started"].includes(s)) return "#3b82f6";
      if (["bloqué", "bloque", "blocked"].includes(s)) return "#ef4444";
      if (["à faire", "a faire", "todo", "non démarré", "non demarre"].includes(s)) return "#64748b";
    }
    return PALETTE[hashStringToInt(colorValue(node)) % PALETTE.length];
  }

  function buildHeaders() {
    for (const el of [yearsRowEl, monthsRowEl, weeksRowEl, daysRowEl]) {
      el.innerHTML = "";
      el.style.display = "none";
      el.style.gridTemplateColumns = "";
      el.style.position = "";
      el.style.width = "";
      el.style.height = "";
    }
    if (!visibleStart || !visibleEnd) return;
    const totalDays = diffInDays(visibleStart, visibleEnd) + 1;
    if (totalDays <= 0) return;
    const { containerWidth } = recomputeCellWidth(totalDays);
    const dates = Array.from({ length: totalDays }, (_, i) => addDays(visibleStart, i));
    const today = normalizeDate(new Date());

    if (zoomMode === "all") {
      yearsRowEl.style.display = "block";
      yearsRowEl.style.position = "relative";
      yearsRowEl.style.width = containerWidth + "px";
      yearsRowEl.style.height = "24px";
      for (let y = visibleStart.getFullYear(); y <= visibleEnd.getFullYear(); y++) {
        const segStart = y === visibleStart.getFullYear() ? visibleStart : startOfYear(new Date(y, 0, 1));
        const segEnd = y === visibleEnd.getFullYear() ? visibleEnd : endOfYear(new Date(y, 0, 1));
        const cell = document.createElement("div");
        cell.className = "time-cell";
        cell.textContent = String(y);
        cell.style.position = "absolute";
        cell.style.left = ((diffInDays(visibleStart, segStart) / totalDays) * containerWidth) + "px";
        cell.style.width = (((diffInDays(segStart, segEnd) + 1) / totalDays) * containerWidth) + "px";
        cell.style.height = "24px";
        cell.style.display = "flex";
        cell.style.alignItems = "center";
        cell.style.justifyContent = "center";
        yearsRowEl.appendChild(cell);
      }
    } else if (zoomMode === "year") {
      monthsRowEl.style.display = "grid";
      monthsRowEl.style.gridTemplateColumns = `repeat(${totalDays}, var(--cell-width))`;
      addSegmentedHeader(monthsRowEl, dates, (d) => d.getMonth(), (d) => String(d.getMonth() + 1).padStart(2, "0"));
    } else if (zoomMode === "month") {
      monthsRowEl.style.display = "grid";
      weeksRowEl.style.display = "grid";
      monthsRowEl.style.gridTemplateColumns = weeksRowEl.style.gridTemplateColumns = `repeat(${totalDays}, var(--cell-width))`;
      addSegmentedHeader(monthsRowEl, dates, (d) => `${d.getFullYear()}-${d.getMonth()}`, (d) => d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" }));
      addSegmentedHeader(weeksRowEl, dates, (d) => `${d.getFullYear()}-${isoWeekNumber(d)}`, (d) => "S" + isoWeekNumber(d).toString().padStart(2, "0"));
    } else {
      monthsRowEl.style.display = "grid";
      daysRowEl.style.display = "grid";
      monthsRowEl.style.gridTemplateColumns = daysRowEl.style.gridTemplateColumns = `repeat(${totalDays}, var(--cell-width))`;
      addSegmentedHeader(monthsRowEl, dates, (d) => `${d.getFullYear()}-${d.getMonth()}`, (d) => d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" }));
      for (const d of dates) {
        const cell = document.createElement("div");
        cell.className = "time-cell" + (isWeekend(d) ? " weekend" : "") + (isSameDay(d, today) ? " today" : "");
        cell.textContent = d.getDate().toString().padStart(2, "0");
        daysRowEl.appendChild(cell);
      }
    }
    currentPeriodEl.textContent = `${formatDate(visibleStart)} – ${formatDate(visibleEnd)}`;
  }

  function addSegmentedHeader(el, dates, keyFn, labelFn) {
    let start = 0;
    let current = keyFn(dates[0]);
    for (let i = 0; i < dates.length; i++) {
      const isLast = i === dates.length - 1;
      const next = !isLast ? keyFn(dates[i + 1]) : null;
      if (isLast || next !== current) {
        const cell = document.createElement("div");
        cell.className = "time-cell";
        cell.textContent = labelFn(dates[i]);
        cell.style.gridColumn = `${start + 1} / ${i + 2}`;
        el.appendChild(cell);
        start = i + 1;
        current = next;
      }
    }
  }

  function buildSidebarMeta(node) {
    const parts = [];
    if (node.aggStart || node.aggEnd) parts.push(`${formatDateShort(node.aggStart || node.aggEnd)} – ${formatDateShort(node.aggEnd || node.aggStart)}`);
    if (node.status) parts.push(node.status);
    if (node.responsible) parts.push(node.responsible);
    if (node.progress != null) parts.push(`${Math.round(node.progress)}%`);
    if (node.source.tableId) parts.push(`↳ ${node.source.tableId}`);
    return parts.join(" · ");
  }

  function renderTaskList() {
    const tracks = flatTracks.length ? flatTracks : buildTracks();
    const range = visibleRangeForContainer(taskListEl, tracks.length, TIMELINE_ROW_HEIGHT);
    taskListEl.innerHTML = "";
    taskCountEl.textContent = `${allRecords.length} élément(s)`;
    if (!tracks.length) {
      taskListEl.innerHTML = '<div class="empty">Aucun élément à afficher.</div>';
      return;
    }

    taskListEl.appendChild(createVerticalSpacer(range.topSpacer));
    for (const track of tracks.slice(range.start, range.end)) {
      if (track.kind === "compact") {
        const row = document.createElement("div");
        row.className = `task-row child-row level-${Math.min(3, track.parent.level + 1)} compact-row`;
        row.style.paddingLeft = `${16 + track.parent.level * 18}px`;
        row.innerHTML = `<div class="task-info"><div class="task-name">${track.nodes.length} élément(s) regroupé(s)</div><div class="task-meta">${track.parent.label}</div></div>`;
        taskListEl.appendChild(row);
        continue;
      }

      const node = track.node;
      const row = document.createElement("div");
      row.className = `task-row ${node.children.length ? "parent-row" : "child-row"} level-${node.level}` + (selectedNodeId === node.id ? " selected" : "");
      row.style.paddingLeft = `${8 + (node.level - 1) * 18}px`;
      row.dataset.nodeId = node.id;
      row.dataset.kind = "node";

      const toggle = document.createElement("button");
      toggle.className = "parent-toggle";
      toggle.textContent = node.children.length ? (isNodeExpanded(node) ? "▾" : "▸") : "";
      toggle.disabled = !node.children.length;
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        expandedNodes[node.id] = !isNodeExpanded(node);
        saveState();
        render();
      });
      row.addEventListener("click", () => selectNodeForLinkedViews(node));

      const info = document.createElement("div");
      info.className = "task-info";
      const main = document.createElement("div");
      main.className = "task-name";
      main.textContent = node.label;
      const meta = document.createElement("div");
      meta.className = "task-meta";
      meta.textContent = buildSidebarMeta(node);
      info.appendChild(main);
      info.appendChild(meta);
      row.appendChild(toggle);
      row.appendChild(info);
      taskListEl.appendChild(row);
    }
    taskListEl.appendChild(createVerticalSpacer(range.bottomSpacer));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function metadataKey(tableId, colId) {
    return `${String(tableId || "")}::${String(colId || "")}`;
  }

  function rowsFromGristTable(table) {
    if (Array.isArray(table)) return table;
    if (!table || typeof table !== "object") return [];
    const keys = Object.keys(table).filter((key) => Array.isArray(table[key]));
    const length = keys.reduce((max, key) => Math.max(max, table[key].length), 0);
    const rows = [];
    for (let i = 0; i < length; i++) {
      const row = {};
      for (const key of keys) row[key] = table[key][i];
      rows.push(row);
    }
    return rows;
  }

  function parseWidgetOptions(value) {
    if (!value) return {};
    if (typeof value === "object") return value;
    if (typeof value !== "string") return {};
    try {
      return JSON.parse(value);
    } catch (e) {
      return {};
    }
  }

  function normalizeChoices(options) {
    const source = options?.choices || options?.choiceOptions || [];
    if (!Array.isArray(source)) return [];
    return source
      .map((choice) => {
        if (choice == null) return null;
        if (typeof choice === "object") return String(choice.label ?? choice.value ?? choice.name ?? "");
        return String(choice);
      })
      .filter((choice) => choice.trim() !== "");
  }

  function baseGristType(type) {
    return String(type || "").split(":")[0];
  }

  function refTableIdFromType(type) {
    const parts = String(type || "").split(":");
    return (parts[0] === "Ref" || parts[0] === "RefList") && parts[1] ? parts[1] : null;
  }

  function friendlyFieldType(type) {
    const base = baseGristType(type);
    if (base === "Choice") return "choix";
    if (base === "ChoiceList") return "choix multiples";
    if (base === "Ref") return "référence";
    if (base === "RefList") return "références";
    if (base === "Text") return "texte";
    if (base === "Numeric" || base === "Int") return "numérique";
    if (base === "Date") return "date";
    if (base === "DateTime") return "date/heure";
    if (base === "Bool") return "oui/non";
    return base || "type inconnu";
  }

  async function loadSourceColumnMetadata() {
    if (sourceColumnMetaPromise) return sourceColumnMetaPromise;
    sourceColumnMetaPromise = (async () => {
      const [tablesRaw, columnsRaw] = await Promise.all([
        grist.docApi.fetchTable("_grist_Tables"),
        grist.docApi.fetchTable("_grist_Tables_column")
      ]);
      const tableIdByRecordId = new Map();
      tableMetaCache.clear();
      for (const table of rowsFromGristTable(tablesRaw)) {
        if (table.id != null && table.tableId) {
          const tableId = String(table.tableId);
          tableIdByRecordId.set(Number(table.id), tableId);
          tableMetaCache.set(tableId, { tableId, label: String(table.summarySourceTable || table.tableId) });
        }
      }
      sourceColumnMetaCache.clear();
      const columnRows = rowsFromGristTable(columnsRaw);
      const colIdByRecordId = new Map();
      for (const col of columnRows) {
        const tableId = tableIdByRecordId.get(Number(col.parentId));
        const colId = col.colId ? String(col.colId) : null;
        if (tableId && colId && col.id != null) colIdByRecordId.set(Number(col.id), { tableId, colId });
      }
      for (const col of columnRows) {
        const tableId = tableIdByRecordId.get(Number(col.parentId));
        const colId = col.colId ? String(col.colId) : null;
        if (!tableId || !colId) continue;
        const widgetOptions = parseWidgetOptions(col.widgetOptions);
        const type = String(col.type || "");
        const visibleCol = col.visibleCol != null ? colIdByRecordId.get(Number(col.visibleCol)) : null;
        sourceColumnMetaCache.set(metadataKey(tableId, colId), {
          tableId,
          colId,
          type,
          refTableId: refTableIdFromType(type),
          visibleColId: visibleCol?.colId || widgetOptions.visibleCol || widgetOptions.displayCol || null,
          typeLabel: friendlyFieldType(type),
          choices: normalizeChoices(widgetOptions),
          label: col.label || colId,
          isFormula: !!col.isFormula
        });
      }
      return sourceColumnMetaCache;
    })().catch((err) => {
      sourceColumnMetaPromise = null;
      throw err;
    });
    return sourceColumnMetaPromise;
  }

  function sourceColumnMeta(node, field) {
    const colId = fieldSourceColumn(node, field);
    if (!node?.source?.tableId || !colId) return null;
    return sourceColumnMetaCache.get(metadataKey(node.source.tableId, colId)) || null;
  }

  function tableOptionsHtml(selectedTableId) {
    const tables = Array.from(tableMetaCache.values()).sort((a, b) => a.tableId.localeCompare(b.tableId, "fr"));
    return `<option value="">— choisir une table —</option>` + tables.map((table) => {
      const selected = table.tableId === selectedTableId ? "selected" : "";
      return `<option value="${escapeHtml(table.tableId)}" ${selected}>${escapeHtml(table.tableId)}</option>`;
    }).join("");
  }

  function columnOptionsHtml(tableId, selectedColId, { includeEmpty = true, onlyTypes = null } = {}) {
    const cols = Array.from(sourceColumnMetaCache.values())
      .filter((col) => col.tableId === tableId && !col.isFormula)
      .filter((col) => !onlyTypes || onlyTypes.includes(baseGristType(col.type)))
      .sort((a, b) => a.colId.localeCompare(b.colId, "fr"));
    const empty = includeEmpty ? `<option value="">—</option>` : "";
    return empty + cols.map((col) => {
      const selected = col.colId === selectedColId ? "selected" : "";
      return `<option value="${escapeHtml(col.colId)}" ${selected}>${escapeHtml(col.label || col.colId)} (${escapeHtml(col.colId)} · ${escapeHtml(col.typeLabel)})</option>`;
    }).join("");
  }

  function directFieldValue(row, cfg, field) {
    const col = cfg?.[`${field}Col`];
    return col ? row?.[col] : null;
  }

  function directParentIds(row, parentCol) {
    if (!parentCol || row?.[parentCol] == null) return [];
    const refs = parseRefValues(row[parentCol]);
    const ids = refs.map((ref) => ref.rowId).filter((id) => id != null);
    if (ids.length) return ids;
    const value = row[parentCol];
    if (Array.isArray(value)) return splitListValue(value).map(Number).filter(Number.isFinite);
    const n = Number(value);
    return Number.isFinite(n) ? [n] : [];
  }

  function directNodeFromRow(row, level, cfg, sourceIndex) {
    const rowId = rowIdFromGristRow(row);
    if (rowId == null) return null;
    const label = String(directFieldValue(row, cfg, "name") || row.Name || row.name || row.id || "").trim();
    const startDate = normalizeDate(directFieldValue(row, cfg, "start"));
    const endDate = normalizeDate(directFieldValue(row, cfg, "end"));
    const source = {
      tableId: cfg.tableId,
      rowId,
      startCol: cfg.startCol || null,
      endCol: cfg.endCol || null,
      progressCol: cfg.progressCol || null,
      nameCol: cfg.nameCol || null,
      statusCol: cfg.statusCol || null,
      responsibleCol: cfg.responsibleCol || null,
      parentCol: cfg.parentCol || null,
      extraCols: {}
    };
    for (const extra of cfg.extraFields || []) {
      if (extra?.id && extra.colId) source.extraCols[extra.id] = extra.colId;
    }
    const node = createEmptyNode({
      id: `L${level}:src:${cfg.tableId}:${rowId}`,
      level,
      label,
      parentId: null,
      sourceIndex,
      sourceRowId: rowId,
      source
    });
    node.startDate = startDate;
    node.endDate = endDate;
    node.explicitDates = !!(startDate || endDate);
    node.status = String(directFieldValue(row, cfg, "status") || "");
    const responsibleRaw = directFieldValue(row, cfg, "responsible");
    node.responsible = displayValueForField(responsibleRaw);
    node.progress = parseProgress(directFieldValue(row, cfg, "progress"));
    node.fieldRawValues = {
      name: directFieldValue(row, cfg, "name"),
      status: directFieldValue(row, cfg, "status"),
      responsible: responsibleRaw,
      progress: directFieldValue(row, cfg, "progress")
    };
    node.extraFields = {};
    for (const extra of cfg.extraFields || []) {
      if (!extra?.id || !extra.colId) continue;
      const raw = row?.[extra.colId];
      const fieldKey = fieldKeyForExtra(extra);
      node.extraFields[extra.id] = { ...extra, raw, value: displayValueForField(raw) };
      node.fieldRawValues[fieldKey] = raw;
    }
    node.rawRows = [rowId];
    node.isLinkedSelection = false;
    return node;
  }

  function rowIdFromGristRow(row) {
    const rowId = Number(row?.id ?? row?.Id ?? row?.ID);
    return Number.isFinite(rowId) ? rowId : null;
  }

  function isDirectLevelDrivenByCurrentView(cfg) {
    return !!(cfg?.tableId && currentTableId && cfg.tableId === currentTableId && Array.isArray(currentViewRecords));
  }

  function currentViewRowIdSignature() {
    if (!Array.isArray(currentViewRecords)) return "";
    return currentViewRecords
      .map(rowIdFromGristRow)
      .filter((rowId) => rowId != null)
      .join(",");
  }

  function directConstraintSignature() {
    const constrainedTables = LEVELS
      .map((levelInfo) => directMappingConfig.levels[levelInfo.level])
      .filter(isDirectLevelDrivenByCurrentView)
      .map((cfg) => cfg.tableId);
    if (!constrainedTables.length) return null;
    return `${[...new Set(constrainedTables)].sort().join("|")}:${currentViewRowIdSignature()}`;
  }

  async function sourceRowsForTable(tableId) {
    if (!sourceTableRowsCache.has(tableId)) {
      sourceTableRowsCache.set(tableId, rowsFromGristTable(await grist.docApi.fetchTable(tableId)));
    }
    return sourceTableRowsCache.get(tableId);
  }

  function invalidateSourceTableRows(tableId, reason) {
    // Cache invalidation policy: source table rows are reused across renders and
    // cleared only for the table touched by direct writes/additions/deletions.
    // Metadata/reference caches stay intact because row mutations do not change schema.
    if (!tableId) return;
    sourceTableRowsCache.delete(tableId);
    directHierarchyDirty = true;
    directHierarchyConstraintSignature = null;
    console.debug(`Cache lignes source invalidé pour ${tableId}${reason ? ` (${reason})` : ""}`);
  }

  function clearAllSourceTableRowsCache(reason) {
    // Mapping or view-context changes can affect which source tables are read; clear all rows.
    sourceTableRowsCache.clear();
    directHierarchyDirty = true;
    directHierarchyConstraintSignature = null;
    console.debug(`Cache lignes source entièrement invalidé${reason ? ` (${reason})` : ""}`);
  }

  async function directRowsForLevel(cfg) {
    const sourceRows = await sourceRowsForTable(cfg.tableId);
    if (!isDirectLevelDrivenByCurrentView(cfg)) return { rows: sourceRows, isConstrained: false };

    const sourceRowsById = new Map();
    for (const row of sourceRows) {
      const rowId = rowIdFromGristRow(row);
      if (rowId != null) sourceRowsById.set(rowId, row);
    }

    const visibleRows = currentViewRecords
      .map(rowIdFromGristRow)
      .filter((rowId) => rowId != null)
      .map((rowId) => sourceRowsById.get(rowId))
      .filter(Boolean);

    return { rows: visibleRows, isConstrained: true };
  }

  function constrainedDirectTree(roots, nodes, levelNodes) {
    const constrainedNodeIds = new Set();
    const selectedContextNodeIds = new Set();
    let hasConstrainedLevel = false;

    for (const [level, current] of levelNodes.entries()) {
      if (!current.isConstrained) continue;
      hasConstrainedLevel = true;

      for (const node of current.byRowId.values()) {
        constrainedNodeIds.add(node.id);
        selectedContextNodeIds.add(node.id);
      }

      if (level <= 1) continue;
      const parent = levelNodes.get(level - 1);
      if (!parent) continue;

      for (const row of current.rows) {
        const parentIds = directParentIds(row, current.cfg.parentCol);
        for (const parentId of parentIds) {
          const parentNode = parent.byRowId.get(parentId);
          if (parentNode) selectedContextNodeIds.add(parentNode.id);
        }
      }
    }
    if (!hasConstrainedLevel) return { roots, nodes };
    if (!constrainedNodeIds.size && !selectedContextNodeIds.size) return { roots: [], nodes: new Map() };

    const visibleIds = new Set();
    const descendantVisits = new Set();
    function includeAncestors(node) {
      let current = node;
      while (current) {
        visibleIds.add(current.id);
        current = current.parentId ? nodes.get(current.parentId) : null;
      }
    }
    function includeDescendants(node) {
      if (!node || descendantVisits.has(node.id)) return;
      descendantVisits.add(node.id);
      visibleIds.add(node.id);
      node.children.forEach(includeDescendants);
    }

    for (const nodeId of constrainedNodeIds) {
      const node = nodes.get(nodeId);
      if (node) node.isLinkedSelection = true;
    }

    for (const nodeId of selectedContextNodeIds) {
      const node = nodes.get(nodeId);
      if (!node) continue;
      includeAncestors(node);
      includeDescendants(node);
    }

    function prune(node) {
      if (!visibleIds.has(node.id)) return null;
      node.children = node.children.map(prune).filter(Boolean);
      return node;
    }

    const prunedRoots = roots.map(prune).filter(Boolean);
    const prunedNodes = new Map();
    for (const [id, node] of nodes.entries()) {
      if (visibleIds.has(id)) prunedNodes.set(id, node);
    }
    return { roots: prunedRoots, nodes: prunedNodes };
  }

  async function buildDirectMultitableRecords() {
    const constraintSignature = directConstraintSignature();
    if (constraintSignature && !directHierarchyDirty && constraintSignature === directHierarchyConstraintSignature && allRecords.length) {
      return allRecords;
    }

    await loadSourceColumnMetadata();
    const nodes = new Map();
    const levelNodes = new Map();
    const constrainedLevels = new Set();
    const configuredLevels = LEVELS
      .map((levelInfo) => ({
        ...levelInfo,
        cfg: directMappingConfig.levels[levelInfo.level]
      }))
      .filter(({ cfg }) => cfg?.tableId && cfg.nameCol);

    const levelRows = await Promise.all(configuredLevels.map(({ cfg }) => directRowsForLevel(cfg)));
    let sourceIndex = 0;

    configuredLevels.forEach((levelInfo, levelPosition) => {
      const { cfg } = levelInfo;
      const { rows, isConstrained } = levelRows[levelPosition];
      if (isConstrained) constrainedLevels.add(levelInfo.level);
      const byRowId = new Map();
      for (const row of rows) {
        const node = directNodeFromRow(row, levelInfo.level, cfg, sourceIndex++);
        if (!node) continue;
        nodes.set(node.id, node);
        byRowId.set(node.source.rowId, node);
      }
      levelNodes.set(levelInfo.level, { rows, byRowId, cfg, isConstrained });
    });

    const hasConstrainedLevel = constrainedLevels.size > 0;
    const minConstrainedLevel = hasConstrainedLevel ? Math.min(...constrainedLevels) : null;
    const roots = [];
    for (const levelInfo of LEVELS) {
      const level = levelInfo.level;
      const current = levelNodes.get(level);
      if (!current) continue;
      if (level === 1) {
        for (const node of current.byRowId.values()) roots.push(node);
        continue;
      }
      const parent = levelNodes.get(level - 1);
      for (const row of current.rows) {
        const rowId = rowIdFromGristRow(row);
        const node = current.byRowId.get(rowId);
        if (!node) continue;
        const parentIds = directParentIds(row, current.cfg.parentCol);
        const parentNode = parentIds.map((id) => parent?.byRowId.get(id)).find(Boolean);
        if (parentNode) {
          node.parentId = parentNode.id;
          parentNode.children.push(node);
        } else if (!hasConstrainedLevel || level <= minConstrainedLevel || !parent) {
          roots.push(node);
        }
      }
    }

    function finalize(node) {
      let min = node.startDate || null;
      let max = node.endDate || node.startDate || null;
      node.children.sort(sortNodes);
      for (const child of node.children) {
        finalize(child);
        if (child.aggStart && (!min || child.aggStart < min)) min = child.aggStart;
        if (child.aggEnd && (!max || child.aggEnd > max)) max = child.aggEnd;
        if (!node.status && child.status) node.status = child.status;
        if (!node.responsible && child.responsible) node.responsible = child.responsible;
      }
      node.aggStart = node.startDate || min;
      node.aggEnd = node.endDate || max || min;
      node.isMilestone = !node.startDate && !!node.endDate;
      node.milestoneDate = node.isMilestone ? node.endDate : null;
      return node;
    }

    const constrained = constrainedDirectTree(roots, nodes, levelNodes);
    const visibleRoots = constrained.roots;
    const visibleNodes = constrained.nodes;

    visibleRoots.sort(sortNodes).forEach(finalize);
    nodeById = visibleNodes;
    allRecords = Array.from(visibleNodes.values());
    treeRoots = visibleRoots;
    directHierarchyDirty = false;
    directHierarchyConstraintSignature = constraintSignature;
    return allRecords;
  }

  async function loadAndRenderDirectMapping() {
    directMappingModeActive = hasDirectMappingConfig(directMappingConfig);
    if (!directMappingModeActive) return false;
    try {
      setDebugStatus("Chargement interne des tables sources…");
      await buildDirectMultitableRecords();
      const range = computeGlobalRange(allRecords);
      globalMinDate = range.min;
      globalMaxDate = range.max;
      keepOrRecomputeVisibleRange();
      saveState();
      setDebugStatus(`Mapping interne OK: ${allRecords.length} élément(s)`);
      setDebugSyncMode("docApi.fetchTable/applyUserActions (mapping interne)");
      render();
      return true;
    } catch (err) {
      console.error(err);
      showToast(err.message || "Erreur de chargement du mapping interne", "error");
      setDebugStatus("Mapping interne KO");
      return true;
    }
  }

  function scheduleTooltipMetadataRefresh(node) {
    if (!node?.source?.tableId) return;
    const fields = ["name", "start", "end", "status", "responsible", "progress", ...Object.keys(node.extraFields || {}).map((id) => `extra:${id}`)];
    const needsMetadata = fields.some((field) => {
      const colId = fieldSourceColumn(node, field);
      return colId && !sourceColumnMetaCache.has(metadataKey(node.source.tableId, colId));
    });
    if (!needsMetadata) return;
    loadSourceColumnMetadata()
      .then(() => {
        if (tooltipState.nodeId === node.id && tooltipEl?.classList.contains("visible")) {
          tooltipState.forceRefresh = true;
          refreshActiveTooltip();
        }
      })
      .catch((err) => {
        console.warn("Impossible de charger les métadonnées des colonnes sources :", err);
      });
  }

  function fieldDisplayValue(node, field) {
    const extra = extraFieldConfigForNode(node, field);
    if (extra) {
      const meta = sourceColumnMeta(node, field);
      if (meta?.refTableId && extra.raw != null && refOptionsCache.has(refOptionsKey(meta))) return labelForRefValue(meta, extra.raw) || extra.value || "";
      return extra.value || "";
    }
    if (field === "name") return node.label || "";
    if (field === "status") return node.status || "";
    if (field === "responsible") {
      const meta = sourceColumnMeta(node, field);
      const raw = node.fieldRawValues?.responsible;
      if (meta?.refTableId && raw != null && refOptionsCache.has(refOptionsKey(meta))) return labelForRefValue(meta, raw) || node.responsible || "";
      return node.responsible || "";
    }
    if (field === "progress") return node.progress == null ? "" : Math.round(node.progress);
    if (field === "start") return formatDate(node.startDate || node.milestoneDate || node.aggStart);
    if (field === "end") return formatDate(node.endDate || node.aggEnd || node.milestoneDate);
    return "";
  }

  function editableTooltipRows(node) {
    const rows = [
      { field: "name", label: "Titre", value: fieldDisplayValue(node, "name"), editable: allowEditing },
      { field: "start", label: "Début", value: formatDate(node.startDate || node.milestoneDate || node.aggStart), editable: allowEditing && !node.startDate && !!node.endDate },
      { field: "end", label: "Fin", value: formatDate(node.endDate || node.aggEnd || node.milestoneDate), editable: false },
      { field: "status", label: "Statut", value: fieldDisplayValue(node, "status"), editable: allowEditing },
      { field: "responsible", label: "Responsable", value: fieldDisplayValue(node, "responsible"), editable: allowEditing },
      { field: "progress", label: "Avancement", value: node.progress == null ? "" : `${Math.round(node.progress)}%`, editable: allowEditing },
      ...Object.values(node.extraFields || {}).map((extra) => ({
        field: fieldKeyForExtra(extra),
        label: extra.label,
        value: fieldDisplayValue(node, fieldKeyForExtra(extra)),
        editable: allowEditing
      }))
    ];
    return rows
      .filter((row) => row.field === "name" || row.value || row.editable)
      .map((row) => {
        const sourceCol = fieldSourceColumn(node, row.field);
        const meta = sourceColumnMeta(node, row.field);
        return { ...row, sourceCol, meta };
      });
  }

  function rowTooltipAction(row) {
    if (!allowEditing) return "Édition bloquée";
    if (row.field === "start") return row.editable ? "Créer une date de début égale à la fin" : "Lecture seule";
    if (row.field === "end") return "Lecture seule";
    return row.editable ? "Modifier" : "Lecture seule";
  }

  function selectedChoiceValues(raw, multiple) {
    if (Array.isArray(raw)) return raw.map(String);
    const values = multiple ? splitListValue(raw) : [raw];
    return values.filter((value) => value != null && String(value).trim() !== "").map(String);
  }

  function buildChoiceInput(row, raw) {
    const multiple = baseGristType(row.meta?.type) === "ChoiceList";
    const selected = selectedChoiceValues(raw, multiple);
    const options = row.meta.choices || [];
    const optionHtml = options.map((choice) => {
      const isSelected = selected.includes(choice);
      return `<option value="${escapeHtml(choice)}" ${isSelected ? "selected" : ""}>${escapeHtml(choice)}</option>`;
    }).join("");
    const empty = multiple ? "" : `<option value="" ${selected.length ? "" : "selected"}>—</option>`;
    return `<select data-edit-input ${multiple ? "multiple" : ""}>${empty}${optionHtml}</select>`;
  }


  function refOptionsKey(meta) {
    return `${meta?.tableId || ""}.${meta?.colId || ""}`;
  }

  function chooseRefLabelColumn(rows, meta) {
    if (meta?.visibleColId) return meta.visibleColId;
    const preferred = ["Name", "name", "Title", "title", "Nom", "nom"];
    for (const col of preferred) {
      if (rows.some((row) => row && row[col] != null && String(row[col]).trim())) return col;
    }
    const sample = rows.find(Boolean) || {};
    return Object.keys(sample).find((col) => col !== "id" && col !== "Id" && col !== "ID") || "id";
  }

  async function loadRefOptions(meta) {
    const refTableId = meta?.refTableId;
    if (!refTableId) return [];
    const key = refOptionsKey(meta);
    if (refOptionsCache.has(key)) return refOptionsCache.get(key);
    const rows = rowsFromGristTable(await grist.docApi.fetchTable(refTableId));
    const labelCol = chooseRefLabelColumn(rows, meta);
    const options = rows.map((row) => {
      const id = Number(row.id ?? row.Id ?? row.ID);
      if (!Number.isFinite(id)) return null;
      const rawLabel = row[labelCol] ?? row.Name ?? row.name ?? row.Title ?? row.title ?? id;
      const label = displayValueForField(rawLabel) || String(id);
      return { value: String(id), label };
    }).filter(Boolean).sort((a, b) => a.label.localeCompare(b.label, "fr"));
    refOptionsCache.set(key, options);
    return options;
  }

  function scheduleRefOptionsRefresh(node) {
    const rows = editableTooltipRows(node).filter((row) => {
      const baseType = baseGristType(row.meta?.type);
      return (baseType === "Ref" || baseType === "RefList") && row.meta?.refTableId && !refOptionsCache.has(refOptionsKey(row.meta));
    });
    if (!rows.length) return;
    Promise.all(rows.map((row) => loadRefOptions(row.meta)))
      .then(() => {
        if (tooltipState.nodeId === node.id && tooltipEl?.classList.contains("visible")) {
          tooltipState.forceRefresh = true;
          refreshActiveTooltip();
        }
      })
      .catch((err) => console.warn("Impossible de charger les options de référence :", err));
  }

  function selectedRefValues(raw, multiple) {
    const refs = multiple ? parseRefValues(raw) : [parseRefValue(raw)];
    const ids = refs.map((ref) => ref.rowId).filter((id) => id != null).map(String);
    if (ids.length) return ids;
    return selectedChoiceValues(raw, multiple);
  }

  function buildRefInput(row, raw) {
    const multiple = baseGristType(row.meta?.type) === "RefList";
    const selected = selectedRefValues(raw, multiple);
    const options = refOptionsCache.get(refOptionsKey(row.meta)) || [];
    const optionHtml = options.map((option) => {
      const isSelected = selected.includes(option.value);
      return `<option value="${escapeHtml(option.value)}" ${isSelected ? "selected" : ""}>${escapeHtml(option.label)}</option>`;
    }).join("");
    const empty = multiple ? "" : `<option value="" ${selected.length ? "" : "selected"}>—</option>`;
    return `<select data-edit-input ${multiple ? "multiple" : ""}>${empty}${optionHtml}</select>`;
  }

  function buildTooltipField(row, node) {
    const isEditing = tooltipState.nodeId === node.id && tooltipState.editingField === row.field;
    const classes = ["tooltip-edit-row"];
    if (row.editable) classes.push("editable");
    if (isEditing) classes.push("editing");
    const hint = rowTooltipAction(row);
    const value = row.value || "—";
    if (!isEditing) {
      return `<button type="button" class="${classes.join(" ")}" data-field="${row.field}" ${row.editable ? `title="${escapeHtml(hint)}"` : "disabled"}>
        <span>${escapeHtml(row.label)}</span><strong>${escapeHtml(value)}</strong>
      </button>`;
    }
    const raw = tooltipState.draftValue ?? rawValueForField(node, row.field);
    const baseType = baseGristType(row.meta?.type);
    let input;
    if (baseType === "Date" || baseType === "DateTime") {
      input = `<input data-edit-input type="date" value="${escapeHtml(toGristDateString(normalizeDate(raw)))}" />`;
    } else if ((baseType === "Choice" || baseType === "ChoiceList") && row.meta?.choices?.length) {
      input = buildChoiceInput(row, raw);
    } else if ((baseType === "Ref" || baseType === "RefList") && row.meta?.refTableId) {
      input = buildRefInput(row, raw);
    } else if (row.field === "progress" || baseType === "Numeric" || baseType === "Int" || baseType === "Ref") {
      const attrs = row.field === "progress" ? ' min="0" max="100" step="1"' : ' step="any"';
      input = `<input data-edit-input type="number"${attrs} value="${escapeHtml(raw)}" />`;
    } else if (baseType === "Bool") {
      const checked = raw === true || String(raw).toLowerCase() === "true" || String(raw).toLowerCase() === "oui" || String(raw) === "1";
      input = `<select data-edit-input><option value="false" ${checked ? "" : "selected"}>Non</option><option value="true" ${checked ? "selected" : ""}>Oui</option></select>`;
    } else {
      input = `<input data-edit-input type="text" value="${escapeHtml(raw)}" />`;
    }
    return `<div class="${classes.join(" ")}" data-field="${row.field}">
      <span>${escapeHtml(row.label)}</span>${input}
    </div>`;
  }

  function cancelTooltipHide() {
    if (!tooltipHideTimer) return;
    window.clearTimeout(tooltipHideTimer);
    tooltipHideTimer = null;
  }

  function scheduleTooltipHide(delay = 120) {
    cancelTooltipHide();
    tooltipHideTimer = window.setTimeout(() => {
      tooltipHideTimer = null;
      if (tooltipEl?.matches(":hover")) return;
      if (tooltipState.editingField) return;
      hideTooltip();
    }, delay);
  }

  function positionTooltip(x, y) {
    let left = x + 12;
    let top = y + 10;
    tooltipEl.style.left = left + "px";
    tooltipEl.style.top = top + "px";
    const rect = tooltipEl.getBoundingClientRect();
    if (rect.right > window.innerWidth - 12) left = x - rect.width - 12;
    if (rect.bottom > window.innerHeight - 12) top = window.innerHeight - rect.height - 12;
    tooltipEl.style.left = Math.max(12, left) + "px";
    tooltipEl.style.top = Math.max(12, top) + "px";
  }

  function showTooltip(x, y, node, start, end) {
    if (!tooltipEl) return;
    cancelTooltipHide();
    scheduleTooltipMetadataRefresh(node);
    scheduleRefOptionsRefresh(node);
    const sameVisibleNode = tooltipState.nodeId === node.id && tooltipEl.classList.contains("visible");
    if (sameVisibleNode && !tooltipState.forceRefresh) return;
    tooltipState.forceRefresh = false;
    if (tooltipState.nodeId !== node.id) {
      tooltipState.nodeId = node.id;
      tooltipState.editingField = null;
      tooltipState.draftValue = null;
    }
    const titleEl = tooltipEl.querySelector(".tooltip-title");
    titleEl.textContent = node.label;
    const saveVisible = !!tooltipState.editingField;
    tooltipEl.classList.toggle("editing", saveVisible);
    ttStartEl.textContent = formatDate(start);
    ttEndEl.textContent = formatDate(end);
    ttStartEl.closest(".tooltip-row")?.setAttribute("hidden", "hidden");
    ttEndEl.closest(".tooltip-row")?.setAttribute("hidden", "hidden");
    ttExtraEl.innerHTML = `
      <button type="button" class="tooltip-save" ${saveVisible ? "" : "hidden"}>Enregistrer</button>
      <div class="tooltip-fields">${editableTooltipRows(node).map((row) => buildTooltipField(row, node)).join("")}</div>
    `;
    tooltipEl.classList.add("visible");
    positionTooltip(x, y);
    const input = tooltipEl.querySelector("[data-edit-input]");
    if (input) {
      input.focus();
      input.select();
    }
  }

  function refreshActiveTooltip() {
    const node = tooltipState.nodeId ? nodeById.get(tooltipState.nodeId) : null;
    if (!node || !tooltipEl?.classList.contains("visible")) return;
    const rect = tooltipEl.getBoundingClientRect();
    tooltipState.forceRefresh = true;
    showTooltip(rect.left, rect.top, node, node.startDate || node.milestoneDate || node.aggStart, node.endDate || node.aggEnd || node.milestoneDate);
  }

  function hideTooltip() {
    cancelTooltipHide();
    if (tooltipEl) tooltipEl.classList.remove("visible", "editing");
    tooltipState.nodeId = null;
    tooltipState.editingField = null;
    tooltipState.draftValue = null;
    tooltipState.forceRefresh = false;
  }

  function renderTimeline() {
    timelineGridEl.innerHTML = "";
    if (!visibleStart || !visibleEnd) return;
    const tracks = flatTracks.length ? flatTracks : buildTracks();
    if (!tracks.length) return;
    const totalDays = diffInDays(visibleStart, visibleEnd) + 1;
    if (totalDays <= 0) return;
    const { cellWidth, containerWidth } = recomputeCellWidth(totalDays);
    const rowHeight = TIMELINE_ROW_HEIGHT;
    const totalHeight = tracks.length * rowHeight;
    const range = visibleRangeForContainer(timelineBodyEl, tracks.length, rowHeight);
    timelineGridEl.style.width = containerWidth + "px";
    timelineGridEl.style.height = totalHeight + "px";
    timelineGridEl.style.minHeight = totalHeight + "px";
    timelineBodyEl.style.height = totalHeight + "px";
    timelineBodyEl.style.minHeight = totalHeight + "px";

    function dateToFrac(d) {
      if (!d) return null;
      const clamped = d < visibleStart ? visibleStart : d > visibleEnd ? visibleEnd : d;
      return diffInDays(visibleStart, clamped) / totalDays;
    }

    function dateToCenterFrac(d) {
      if (!d) return null;
      const clamped = d < visibleStart ? visibleStart : d > visibleEnd ? visibleEnd : d;
      return (diffInDays(visibleStart, clamped) + 0.5) / totalDays;
    }

    const weekStartOffset = (visibleStart.getDay() + 6) % 7;
    timelineGridEl.style.setProperty("--week-offset-width", `${-weekStartOffset * cellWidth}px`);
    timelineGridEl.style.setProperty("--weekend-start-width", `${5 * cellWidth}px`);
    timelineGridEl.style.setProperty("--week-cycle-width", `${7 * cellWidth}px`);

    timelineGridEl.appendChild(createVerticalSpacer(range.topSpacer));
    for (let t = range.start; t < range.end; t++) {
      const row = document.createElement("div");
      row.className = "grid-row";
      row.style.width = containerWidth + "px";
      timelineGridEl.appendChild(row);
    }
    timelineGridEl.appendChild(createVerticalSpacer(range.bottomSpacer));

    const today = normalizeDate(new Date());
    const todayDiff = diffInDays(visibleStart, today);
    if (todayDiff >= 0 && todayDiff < totalDays) {
      const line = document.createElement("div");
      line.className = "today-line";
      line.style.left = (todayDiff * (containerWidth / Math.max(1, totalDays))) + "px";
      timelineGridEl.appendChild(line);
    }

    function addNodeBar(trackIndex, node, hideLabel) {
      const start = node.isMilestone ? node.milestoneDate : (node.startDate || node.aggStart || node.endDate);
      const end = node.isMilestone ? node.milestoneDate : (node.endDate || node.aggEnd || start);
      if (!start || !end || end < visibleStart || start > visibleEnd) return;

      if (node.isMilestone && !node.startDate) {
        const frac = dateToCenterFrac(node.milestoneDate);
        if (frac == null) return;
        const x = frac * containerWidth;
        const centerY = trackIndex * rowHeight + rowHeight / 2;
        const m = document.createElement("div");
        m.className = `gantt-milestone level-${node.level}` + (selectedNodeId === node.id ? " selected" : "");
        m.style.left = x.toFixed(1) + "px";
        m.style.top = centerY.toFixed(1) + "px";
        m.style.background = getColorForNode(node);
        m.dataset.nodeId = node.id;
        m.addEventListener("click", () => selectNodeLocally(node));
        m.addEventListener("mousemove", (ev) => showTooltip(ev.clientX, ev.clientY, node, node.milestoneDate, node.milestoneDate));
        m.addEventListener("mouseenter", (ev) => showTooltip(ev.clientX, ev.clientY, node, node.milestoneDate, node.milestoneDate));
        m.addEventListener("mouseleave", () => scheduleTooltipHide());
        attachMilestoneDrag(m);
        timelineGridEl.appendChild(m);
        if (labelsVisible && !hideLabel) {
          const label = document.createElement("span");
          label.className = `milestone-label level-${node.level}`;
          label.textContent = node.label;
          label.style.left = (x + 18) + "px";
          label.style.top = centerY + "px";
          timelineGridEl.appendChild(label);
        }
        return;
      }

      const s = normalizeDate(start);
      const e = normalizeDate(end);
      const leftFrac = dateToFrac(s);
      const rightFrac = dateToFrac(e);
      if (leftFrac == null || rightFrac == null) return;
      const widthFrac = Math.max(0.01, (rightFrac - leftFrac) + (1 / totalDays));
      const leftPx = leftFrac * containerWidth;
      const widthPx = widthFrac * containerWidth;
      const bar = document.createElement("div");
      bar.className = `gantt-bar level-${node.level}` + (node.children.length ? " parent" : "") + (selectedNodeId === node.id ? " selected" : "");
      bar.style.left = leftPx.toFixed(1) + "px";
      bar.style.width = widthPx.toFixed(1) + "px";
      bar.style.top = trackIndex * rowHeight + 8 + "px";
      bar.style.background = getColorForNode(node);
      bar.dataset.nodeId = node.id;
      bar.dataset.start = s.toISOString();
      bar.dataset.end = e.toISOString();
      bar.dataset.explicitDates = node.explicitDates ? "1" : "";
      if (node.progress != null) {
        const progress = document.createElement("span");
        progress.className = "bar-progress";
        progress.style.width = Math.round(node.progress) + "%";
        bar.appendChild(progress);
      }
      if (labelsVisible && !hideLabel) {
        const label = document.createElement("span");
        label.className = widthPx >= 110 ? "bar-label inside" : "bar-label outside";
        label.textContent = node.label;
        bar.appendChild(label);
      }
      bar.addEventListener("click", () => selectNodeLocally(node));
      bar.addEventListener("mousemove", (ev) => {
        setBarCursor(bar, ev);
        showTooltip(ev.clientX, ev.clientY, node, s, e);
      });
      bar.addEventListener("mouseenter", (ev) => showTooltip(ev.clientX, ev.clientY, node, s, e));
      bar.addEventListener("mouseleave", () => {
        bar.style.cursor = "default";
        scheduleTooltipHide();
      });
      attachBarDrag(bar);
      timelineGridEl.appendChild(bar);
    }

    for (let i = range.start; i < range.end; i++) {
      const track = tracks[i];
      if (track.kind === "node") addNodeBar(i, track.node, false);
      else if (track.kind === "compact") track.nodes.forEach((node) => addNodeBar(i, node, true));
    }
  }

  function setBarCursor(bar, e) {
    if (!allowEditing) {
      bar.style.cursor = "default";
      return;
    }
    const rect = bar.getBoundingClientRect();
    if (e.clientX - rect.left < 8 || rect.right - e.clientX < 8) bar.style.cursor = "ew-resize";
    else bar.style.cursor = "grab";
  }

  function attachBarDrag(bar) {
    bar.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || !allowEditing) return;
      const node = nodeById.get(bar.dataset.nodeId);
      if (!node || !node.explicitDates) {
        showToast("Cette barre est agrégée : mappez les dates/source du niveau pour l’éditer.", "error");
        return;
      }
      e.preventDefault();
      hideTooltip();
      const rect = bar.getBoundingClientRect();
      const totalDays = diffInDays(visibleStart, visibleEnd) + 1;
      const containerWidth = timelineBodyEl.clientWidth || timelineHeaderEl.clientWidth || rect.width;
      dragState.pxPerDay = containerWidth / Math.max(1, totalDays);
      dragState.active = true;
      dragState.bar = bar;
      dragState.milestone = null;
      dragState.nodeId = node.id;
      dragState.originalStart = normalizeDate(bar.dataset.start);
      dragState.originalEnd = normalizeDate(bar.dataset.end);
      dragState.startX = e.clientX;
      const offsetX = e.clientX - rect.left;
      if (offsetX < 8) dragState.type = "resize-left";
      else if (rect.right - e.clientX < 8) dragState.type = "resize-right";
      else dragState.type = "move";
      showDragBubble(`${formatDate(dragState.originalStart)} → ${formatDate(dragState.originalEnd)}<span class="muted">édition</span>`, e.clientX, rect.top + rect.height / 2);
      document.addEventListener("mousemove", onDragMove);
      document.addEventListener("mouseup", onDragEnd);
    });
  }

  function attachMilestoneDrag(m) {
    m.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || !allowEditing) return;
      const node = nodeById.get(m.dataset.nodeId);
      if (!node || !node.source.rowId) return;
      e.preventDefault();
      hideTooltip();
      const rect = m.getBoundingClientRect();
      const totalDays = diffInDays(visibleStart, visibleEnd) + 1;
      const containerWidth = timelineBodyEl.clientWidth || timelineHeaderEl.clientWidth || rect.width;
      dragState.pxPerDay = containerWidth / Math.max(1, totalDays);
      dragState.active = true;
      dragState.bar = null;
      dragState.milestone = m;
      dragState.nodeId = node.id;
      dragState.originalMilestoneDate = new Date(node.milestoneDate.getTime());
      dragState.type = "move-milestone";
      dragState.startX = e.clientX;
      showDragBubble(`${formatDate(node.milestoneDate)}<span class="muted">jalon</span>`, e.clientX, rect.top + rect.height / 2);
      document.addEventListener("mousemove", onDragMove);
      document.addEventListener("mouseup", onDragEnd);
    });
  }

  function onDragMove(e) {
    if (!dragState.active) return;
    e.preventDefault();
    const deltaDays = Math.round((e.clientX - dragState.startX) / dragState.pxPerDay);
    const totalDays = diffInDays(visibleStart, visibleEnd) + 1;
    const containerWidth = timelineBodyEl.clientWidth || timelineHeaderEl.clientWidth;
    if (!containerWidth || !totalDays) return;

    if (dragState.bar) {
      let newStart = new Date(dragState.originalStart.getTime());
      let newEnd = new Date(dragState.originalEnd.getTime());
      if (dragState.type === "move") {
        newStart = addDays(newStart, deltaDays);
        newEnd = addDays(newEnd, deltaDays);
      } else if (dragState.type === "resize-left") {
        newStart = addDays(newStart, deltaDays);
        if (newStart > newEnd) newStart = new Date(newEnd.getTime());
      } else if (dragState.type === "resize-right") {
        newEnd = addDays(newEnd, deltaDays);
        if (newEnd < newStart) newEnd = new Date(newStart.getTime());
      }
      const leftFrac = diffInDays(visibleStart, newStart) / totalDays;
      const rightFrac = diffInDays(visibleStart, newEnd) / totalDays;
      const widthFrac = Math.max(0.01, (rightFrac - leftFrac) + (1 / totalDays));
      dragState.bar.style.left = (leftFrac * containerWidth).toFixed(1) + "px";
      dragState.bar.style.width = (widthFrac * containerWidth).toFixed(1) + "px";
      dragState.bar.dataset.start = newStart.toISOString();
      dragState.bar.dataset.end = newEnd.toISOString();
      const rect = dragState.bar.getBoundingClientRect();
      showDragBubble(`${formatDate(newStart)} → ${formatDate(newEnd)}<span class="muted">édition</span>`, e.clientX, rect.top + rect.height / 2);
    } else if (dragState.milestone) {
      const newDate = addDays(dragState.originalMilestoneDate, deltaDays);
      const x = ((diffInDays(visibleStart, newDate) + 0.5) / totalDays) * containerWidth;
      dragState.milestone.style.left = x.toFixed(1) + "px";
      const rect = dragState.milestone.getBoundingClientRect();
      showDragBubble(`${formatDate(newDate)}<span class="muted">jalon</span>`, e.clientX, rect.top + rect.height / 2);
    }
  }

  async function onDragEnd(e) {
    if (!dragState.active) return;
    e.preventDefault();
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
    hideDragBubble();

    try {
      const node = nodeById.get(dragState.nodeId);
      if (!node) return;
      if (dragState.type === "move-milestone") {
        const deltaDays = Math.round((e.clientX - dragState.startX) / dragState.pxPerDay);
        const newDate = addDays(dragState.originalMilestoneDate, deltaDays);
        await updateNodeDates(node, null, newDate);
      } else {
        await updateNodeDates(node, normalizeDate(dragState.bar.dataset.start), normalizeDate(dragState.bar.dataset.end));
      }
      showToast("Dates mises à jour dans la table source", "success");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Erreur lors de la mise à jour", "error");
    } finally {
      dragState.active = false;
      dragState.type = null;
      dragState.bar = null;
      dragState.milestone = null;
      dragState.nodeId = null;
    }
  }

  function fieldSourceColumn(node, field) {
    const extraId = parseExtraFieldKey(field);
    if (extraId) return node.source.extraCols?.[extraId] || null;
    if (field === "name") return node.source.nameCol;
    if (field === "status") return node.source.statusCol;
    if (field === "responsible") return node.source.responsibleCol;
    if (field === "progress") return node.source.progressCol;
    if (field === "start") return node.source.startCol;
    if (field === "end") return node.source.endCol;
    return null;
  }


  async function writeNodeFields(node, sourceFields, debugLabel) {
    if (node.source.tableId && node.source.rowId != null && Object.keys(sourceFields).length) {
      await grist.docApi.applyUserActions([["UpdateRecord", node.source.tableId, node.source.rowId, sourceFields]]);
      setDebugSyncMode("docApi.applyUserActions (vraie table source)");
      setDebugAction(`Update ${node.source.tableId}#${node.source.rowId}: ${Object.keys(sourceFields).join(", ")}`);
      invalidateSourceTableRows(node.source.tableId, `écriture ${debugLabel || "champ"}`);
      return;
    }

    throw new Error("Aucune cible d’écriture. Configurez le mapping interne avec la table, la ligne et la colonne source du niveau.");
  }

  async function updateNodeDates(node, newStart, newEnd) {
    if (!allowEditing) throw new Error("L’édition est bloquée.");
    const sourceFields = {};
    if (newStart && node.source.startCol) sourceFields[node.source.startCol] = toGristDateString(newStart);
    if (newEnd && node.source.endCol) sourceFields[node.source.endCol] = toGristDateString(newEnd);
    await writeNodeFields(node, sourceFields, "dates");
    applyLocalDateChange(node, newStart, newEnd);
  }

  function coerceTooltipValueForSource(node, field, rawValue) {
    if (field === "progress") {
      if (String(rawValue).trim() === "") return null;
      const n = Number(String(rawValue).replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("L’avancement doit être un nombre entre 0 et 100.");
      return n;
    }

    const meta = sourceColumnMeta(node, field);
    const baseType = baseGristType(meta?.type);
    if (baseType === "Date" || baseType === "DateTime") {
      const date = normalizeDate(rawValue);
      return date ? toGristDateString(date) : null;
    }
    if (baseType === "ChoiceList") {
      const values = Array.isArray(rawValue) ? rawValue : splitListValue(rawValue);
      const choices = values.map((value) => String(value).trim()).filter(Boolean);
      return choices.length ? ["L", ...choices] : ["L"];
    }
    if (baseType === "RefList") {
      const values = Array.isArray(rawValue) ? rawValue : splitListValue(rawValue);
      const refs = values.map((value) => Number(value)).filter(Number.isFinite).map(Math.trunc);
      return refs.length ? ["L", ...refs] : ["L"];
    }
    if (baseType === "Numeric" || baseType === "Int" || baseType === "Ref") {
      if (String(rawValue).trim() === "") return null;
      const n = Number(String(rawValue).replace(",", "."));
      if (!Number.isFinite(n)) throw new Error("La valeur doit être numérique pour ce champ source.");
      return baseType === "Int" || baseType === "Ref" ? Math.trunc(n) : n;
    }
    if (baseType === "Bool") return rawValue === true || String(rawValue).toLowerCase() === "true" || String(rawValue) === "1";
    return rawValue;
  }

  async function updateTooltipField(node, field, rawValue) {
    if (!allowEditing) throw new Error("L’édition est bloquée.");
    if (field === "start") {
      if (node.startDate || !node.endDate) throw new Error("La date de début ne peut être créée que pour un jalon avec une date de fin.");
      await updateNodeDates(node, node.endDate, node.endDate);
      return;
    }

    const value = coerceTooltipValueForSource(node, field, rawValue);
    const sourceFields = {};
    const sourceCol = fieldSourceColumn(node, field);
    if (sourceCol) sourceFields[sourceCol] = value;
    await writeNodeFields(node, sourceFields, FIELD_LABELS[field] || field);
    await refreshAfterWrite(node, field, value);
  }


  function finalizeTreeDates() {
    function finalize(node) {
      let min = node.startDate || null;
      let max = node.endDate || node.startDate || null;
      node.children.sort(sortNodes);
      for (const child of node.children) {
        finalize(child);
        if (child.aggStart && (!min || child.aggStart < min)) min = child.aggStart;
        if (child.aggEnd && (!max || child.aggEnd > max)) max = child.aggEnd;
      }
      node.aggStart = node.startDate || min;
      node.aggEnd = node.endDate || max || min;
      node.isMilestone = !node.startDate && !!node.endDate;
      node.milestoneDate = node.isMilestone ? node.endDate : null;
    }
    treeRoots.forEach(finalize);
    const range = computeGlobalRange(allRecords);
    globalMinDate = range.min;
    globalMaxDate = range.max;
    keepOrRecomputeVisibleRange();
  }

  function labelForRefValue(meta, value) {
    const options = refOptionsCache.get(refOptionsKey(meta)) || [];
    const byValue = new Map(options.map((option) => [option.value, option.label]));
    const values = Array.isArray(value) ? value : splitListValue(value);
    const labels = values.map((item) => byValue.get(String(item)) || parseRefValue(item).label).filter(Boolean);
    return labels.join(", ");
  }

  function applyLocalTooltipValue(node, field, value) {
    node.fieldRawValues = { ...(node.fieldRawValues || {}), [field]: value };
    if (field === "name") node.label = displayValueForField(value) || node.label;
    else if (field === "status") node.status = displayValueForField(value);
    else if (field === "responsible") {
      const meta = sourceColumnMeta(node, field);
      node.responsible = (meta?.refTableId ? labelForRefValue(meta, value) : displayValueForField(value)) || "";
    } else if (field === "progress") node.progress = parseProgress(value);
  }

  function applyLocalDateChange(node, newStart, newEnd) {
    if (newStart) node.startDate = normalizeDate(newStart);
    if (newEnd) node.endDate = normalizeDate(newEnd);
    node.explicitDates = !!(node.startDate || node.endDate);
    finalizeTreeDates();
    render();
  }

  async function refreshAfterWrite(node, field, value) {
    if (directMappingModeActive) {
      await DataModel.loadAndRenderDirectMapping();
      return;
    }
    applyLocalTooltipValue(node, field, value);
    finalizeTreeDates();
    render();
  }

  function refreshTableInfo() {
    const routed = allRecords.filter((n) => n.source.tableId && n.source.rowId != null).length;
    const directTables = LEVELS.map((levelInfo) => directMappingConfig.levels[levelInfo.level]?.tableId).filter(Boolean).join(" → ");
    if (mappingInfoEl) mappingInfoEl.textContent = directMappingModeActive
      ? `Mapping interne multitable : ${directTables || "aucune table"}, écritures routées = ${routed}/${allRecords.length}`
      : "Mapping interne multitable : à configurer avec le bouton Mapping";
    setDebugSyncMode(latestWriteSummary);
  }

  function hasCollapsibleNodes() {
    return allRecords.some((n) => n.children.length);
  }

  function readTooltipEditValue(input) {
    if (!input) return tooltipState.draftValue;
    if (input.tagName === "SELECT" && input.multiple) {
      return Array.from(input.selectedOptions).map((option) => option.value);
    }
    return input.value;
  }

  function areAllCollapsibleNodesExpanded() {
    const nodesWithChildren = allRecords.filter((n) => n.children.length);
    return nodesWithChildren.length > 0 && nodesWithChildren.every((n) => expandedNodes[n.id] !== false);
  }

  function updateExpandAllButton() {
    const label = areAllCollapsibleNodesExpanded() ? "Tout plier" : "Tout déplier";
    const disabled = !hasCollapsibleNodes();
    [expandAllBtn, tableExpandAllBtn].forEach((btn) => {
      if (!btn) return;
      btn.textContent = label;
      btn.disabled = disabled;
    });
  }

  function updateEditButtons() {
    [toggleDateEditBtn, tableToggleEditBtn].forEach((btn) => {
      if (!btn) return;
      btn.textContent = allowEditing ? "Édition autorisée" : "Édition bloquée";
      btn.classList.toggle("active", allowEditing);
    });
  }

  function clearNodeSelectionClasses() {
    document.querySelectorAll(".selected[data-node-id]").forEach((el) => el.classList.remove("selected"));
  }

  function applyNodeSelectionClasses() {
    clearNodeSelectionClasses();
    if (!selectedNodeId) return;
    document.querySelectorAll(`[data-node-id="${CSS.escape(selectedNodeId)}"]`).forEach((el) => el.classList.add("selected"));
  }

  function linkedRowIdForNode(node) {
    const rowId = Number(node?.source?.rowId);
    if (!Number.isFinite(rowId)) return null;
    return Math.trunc(rowId);
  }

  function ancestorChainForNode(node) {
    const chain = [];
    let current = node;
    while (current) {
      chain.unshift(current);
      current = current.parentId ? nodeById.get(current.parentId) : null;
    }
    return chain;
  }

  function highestLinkedSelectionNode(node) {
    const chain = ancestorChainForNode(node);
    if (!chain.length) return node;
    if (currentTableId) {
      const matchingAncestor = chain.find((candidate) => candidate.source?.tableId === currentTableId);
      if (matchingAncestor) return matchingAncestor;
    }
    return chain[0];
  }

  function selectNodeLocally(node) {
    if (!node) return;
    selectedNodeId = node.id;
    applyNodeSelectionClasses();
    setDebugAction(`Sélection locale ${node.source.tableId || "source"}#${node.source.rowId ?? "?"}`);
  }

  async function selectNodeForLinkedViews(node) {
    if (!node) return;
    selectedNodeId = node.id;
    applyNodeSelectionClasses();
    const linkedNode = highestLinkedSelectionNode(node);
    const rowId = linkedRowIdForNode(linkedNode);
    if (rowId == null) {
      setDebugAction(`Sélection locale ${node.source.tableId || "source"}#${node.source.rowId ?? "?"} (hors table liée)`);
      return;
    }
    try {
      await grist.setSelectedRows([rowId]);
      await grist.setCursorPos({ rowId, linkingRowIds: [rowId] });
      const suffix = linkedNode.id !== node.id ? ` via ${linkedNode.source.tableId || currentTableId || "table"}#${rowId}` : ` ${linkedNode.source.tableId || currentTableId || "table"}#${rowId}`;
      setDebugAction(`Sélection liée${suffix}`);
    } catch (err) {
      console.warn("Impossible de transmettre la sélection aux vues liées :", err);
    }
  }

  function selectNodeByIdForLinkedViews(nodeId) {
    const node = nodeById.get(nodeId);
    if (node) selectNodeForLinkedViews(node);
  }


  function updateTimelineDateSortSelect() {
    if (!timelineDateSortSelect) return;
    const dateOptions = LEVELS.flatMap((levelInfo) => [
      { value: `dateStart${levelInfo.level}`, label: `DateDebut${levelInfo.level}` },
      { value: `dateEnd${levelInfo.level}`, label: `DateFin${levelInfo.level}` }
    ]);
    const options = [{ value: "default", label: "Ordre par défaut" }, ...dateOptions];
    const html = options.map((option) =>
      `<option value="${escapeHtml(option.value)}" ${option.value === timelineSortField ? "selected" : ""}>${escapeHtml(option.label)}</option>`
    ).join("");
    if (timelineDateSortSelect.innerHTML !== html) timelineDateSortSelect.innerHTML = html;
    timelineDateSortSelect.value = timelineSortField;
  }

  function updateViewModeButtons() {
    timelineViewBtn?.classList.toggle("active", viewMode === "timeline");
    tableViewBtn?.classList.toggle("active", viewMode === "table");
    if (ganttContainer) ganttContainer.hidden = viewMode !== "timeline";
    if (tableViewEl) tableViewEl.hidden = viewMode !== "table";
    if (addLevel1Btn) {
      addLevel1Btn.hidden = true;
      addLevel1Btn.disabled = !canAddLevel(1);
    }
    if (tableAddLevel1Btn) tableAddLevel1Btn.disabled = !canAddLevel(1);
    if (tableExpandAllBtn) tableExpandAllBtn.disabled = !hasCollapsibleNodes();
    updateEditButtons();
    const timelineOnly = [expandAllBtn, prevBtn, nextBtn, todayBtn, toggleSidebarBtn, toggleLabelsBtn, groupChildrenBtn, toggleDateEditBtn];
    timelineOnly.forEach((btn) => { if (btn) btn.hidden = viewMode !== "timeline"; });
    if (zoomControlsEl) zoomControlsEl.hidden = viewMode !== "timeline";
    if (currentPeriodEl) currentPeriodEl.hidden = viewMode !== "timeline";
    if (tableToolbarActionsEl) tableToolbarActionsEl.hidden = viewMode !== "table";
    renderTableFieldSelect();
    if (timelineDateSortSelect?.parentElement) timelineDateSortSelect.parentElement.hidden = false;
    updateTimelineDateSortSelect();
  }

  function hasLinkedSelectionInSubtree(node) {
    if (node.isLinkedSelection) return true;
    return node.children.some(hasLinkedSelectionInSubtree);
  }

  function timelineSortConfig() {
    const match = /^date(Start|End)([1-3])$/.exec(timelineSortField || "");
    if (!match) return null;
    return { kind: match[1] === "Start" ? "start" : "end", level: Number(match[2]) };
  }

  function dateValueForTimelineSort(node, config) {
    if (!node || !config) return null;
    if (node.level === config.level) {
      if (config.kind === "start") return node.startDate || node.milestoneDate || node.aggStart || null;
      return node.endDate || node.aggEnd || node.milestoneDate || node.startDate || null;
    }

    let selected = null;
    function visit(candidate) {
      if (!candidate || candidate.level > config.level) return;
      if (candidate.level === config.level) {
        const value = config.kind === "start"
          ? candidate.startDate || candidate.milestoneDate || candidate.aggStart || null
          : candidate.endDate || candidate.aggEnd || candidate.milestoneDate || candidate.startDate || null;
        if (value && (!selected || value < selected)) selected = value;
        return;
      }
      candidate.children.forEach(visit);
    }
    node.children.forEach(visit);
    return selected;
  }

  function compareNodesForTimeline(a, b) {
    const config = timelineSortConfig();
    if (!config) return sortNodes(a, b);
    const ad = dateValueForTimelineSort(a, config);
    const bd = dateValueForTimelineSort(b, config);
    if (ad && bd) {
      const diff = ad.getTime() - bd.getTime();
      if (diff) return diff;
    } else if (ad || bd) {
      return ad ? -1 : 1;
    }
    return sortNodes(a, b);
  }

  function sortedTimelineChildren(node) {
    return [...(node.children || [])].sort(compareNodesForTimeline);
  }

  function sortedTableChildren(node) {
    return [...(node.children || [])].sort(compareNodesForTimeline);
  }

  function tableFilterValue(node, field) {
    const value = tableFieldValue(node, field);
    if (field === "progress" && value !== "") return `${value}%`;
    if (field === "start" || field === "end") return formatDate(value);
    return String(value || "").trim();
  }

  function nodeMatchesTableFilters(node) {
    const filters = sanitizeTableColumnFilters(tableColumnFilters);
    for (const [field, selectedValues] of Object.entries(filters)) {
      if (!selectedValues.length) continue;
      const value = tableFilterValue(node, field);
      if (!selectedValues.includes(value)) return false;
    }
    return true;
  }

  function subtreeMatchesTableFilters(node) {
    if (nodeMatchesTableFilters(node)) return true;
    return (node.children || []).some(subtreeMatchesTableFilters);
  }

  function visibleTableRows() {
    const rows = [];
    const filtered = hasActiveTableFilters();
    function walk(node) {
      const matchesSelf = !filtered || nodeMatchesTableFilters(node);
      const matchesSubtree = !filtered || matchesSelf || (node.children || []).some(subtreeMatchesTableFilters);
      if (!matchesSubtree) return;
      rows.push(node);
      const expanded = filtered || isNodeExpanded(node);
      for (const child of sortedTableChildren(node)) {
        if (expanded || hasLinkedSelectionInSubtree(child)) walk(child);
      }
    }
    [...treeRoots].sort(compareNodesForTimeline).forEach((root) => walk(root));
    return rows;
  }

  function tableFieldValue(node, field) {
    if (field === "start") return node.startDate || node.milestoneDate || "";
    if (field === "end") return node.endDate || node.aggEnd || node.milestoneDate || "";
    if (field === "progress") return node.progress == null ? "" : Math.round(node.progress);
    return fieldDisplayValue(node, field);
  }

  function renderTableFieldSelect() {
    if (!tableFieldSelect) return;
    const fields = allTableFieldDefs();
    tableVisibleFields = sanitizeTableVisibleFields(tableVisibleFields);
    const selected = new Set(tableVisibleFields);
    const options = fields.map((field) => {
      const suffix = field.level ? ` (N${field.level})` : "";
      const checked = selected.has(field.field) ? "checked" : "";
      return `<label class="table-field-option" role="menuitemcheckbox" aria-checked="${checked ? "true" : "false"}"><input type="checkbox" value="${escapeHtml(field.field)}" ${checked}>${escapeHtml(field.label + suffix)}</label>`;
    }).join("");
    tableFieldSelect.innerHTML = `<div class="table-field-option disabled" aria-disabled="true">Choix</div>${options}`;
    if (tableFieldSelectBtn) tableFieldSelectBtn.textContent = "Choix";
  }

  function tableFilterOptions(field) {
    const values = new Map();
    for (const node of allRecords) {
      const value = tableFilterValue(node, field);
      values.set(value, (values.get(value) || 0) + 1);
    }
    return Array.from(values.entries())
      .map(([value, count]) => ({ value, label: value || "—", count }))
      .sort((a, b) => {
        if (!a.value && b.value) return 1;
        if (a.value && !b.value) return -1;
        return a.label.localeCompare(b.label, "fr", { numeric: true, sensitivity: "base" });
      });
  }

  function renderTableHeaderFilter(col) {
    if (!isTableFilterableField(col.field)) return "";
    const options = tableFilterOptions(col.field);
    if (!options.length) return "";
    const selected = new Set(tableColumnFilters[col.field] || []);
    const isOpen = openTableFilterField === col.field;
    const active = selected.size > 0;
    const optionHtml = options.map((option) => {
      const checked = selected.has(option.value) ? "checked" : "";
      const count = option.count > 1 ? ` <small>(${option.count})</small>` : "";
      return `<label class="table-filter-option" role="menuitemcheckbox" aria-checked="${checked ? "true" : "false"}"><input type="checkbox" value="${escapeHtml(option.value)}" ${checked}>${escapeHtml(option.label)}${count}</label>`;
    }).join("");
    return `
      <div class="table-column-filter ${isOpen ? "open" : ""}" data-table-filter-menu="${escapeHtml(col.field)}">
        <button type="button" class="table-filter-button ${active ? "active" : ""}" data-table-filter-toggle="${escapeHtml(col.field)}" aria-haspopup="true" aria-expanded="${isOpen ? "true" : "false"}" title="Filtrer ${escapeHtml(col.label)}">${active ? selected.size : ""}</button>
        <div class="table-filter-options" ${isOpen ? "" : "hidden"} role="menu">
          <div class="table-filter-actions">
            <button type="button" class="table-filter-action" data-table-filter-all="${escapeHtml(col.field)}">Tout</button>
            <button type="button" class="table-filter-action" data-table-filter-clear="${escapeHtml(col.field)}">Effacer</button>
          </div>
          ${optionHtml}
        </div>
      </div>`;
  }

  function renderTableHeaderCell(col) {
    return `<th style="width:${col.width}"><div class="table-header-cell"><span>${escapeHtml(col.label)}</span>${renderTableHeaderFilter(col)}</div></th>`;
  }

  function visibleTableFieldDefs() {
    const byField = new Map(allTableFieldDefs().map((field) => [field.field, field]));
    tableVisibleFields = sanitizeTableVisibleFields(tableVisibleFields);
    return tableVisibleFields.map((field) => byField.get(field)).filter(Boolean);
  }

  function tableFieldEditable(node, field) {
    if (!allowEditing) return false;
    if (!fieldSourceColumn(node, field)) return false;
    if (field === "end" && !node.source.endCol) return false;
    return true;
  }

  function scheduleTableReferenceRefresh(nodes) {
    const metas = [];
    for (const node of nodes) {
      for (const field of ["responsible", "status", "name", ...Object.keys(node.extraFields || {}).map((id) => `extra:${id}`)]) {
        const meta = sourceColumnMeta(node, field);
        const baseType = baseGristType(meta?.type);
        if ((baseType === "Ref" || baseType === "RefList") && meta?.refTableId && !refOptionsCache.has(refOptionsKey(meta))) {
          metas.push(meta);
        }
      }
    }
    if (!metas.length) return;
    Promise.all(metas.map(loadRefOptions))
      .then(() => { if (viewMode === "table") renderTableView(); })
      .catch((err) => console.warn("Impossible de charger les options de référence de la table :", err));
  }

  function buildTableInput(node, field) {
    const editable = tableFieldEditable(node, field);
    const raw = rawValueForField(node, field);
    const value = tableFieldValue(node, field);
    const baseAttrs = `class="table-cell-editor" data-node-id="${escapeHtml(node.id)}" data-field="${escapeHtml(field)}" ${editable ? "" : "disabled"}`;
    if (!editable) return `<span class="table-cell-readonly">${escapeHtml(field === "progress" && value !== "" ? `${value}%` : (field === "start" || field === "end" ? formatDate(value) : value || "—"))}</span>`;

    const meta = sourceColumnMeta(node, field);
    const baseType = baseGristType(meta?.type);
    if (field === "start" || field === "end" || baseType === "Date" || baseType === "DateTime") {
      return `<input ${baseAttrs} type="date" value="${escapeHtml(toGristDateString(normalizeDate(raw) || normalizeDate(value)))}" />`;
    }
    if ((baseType === "Choice" || baseType === "ChoiceList") && meta?.choices?.length) {
      const multiple = baseType === "ChoiceList";
      const selected = selectedChoiceValues(raw, multiple);
      const options = meta.choices.map((choice) => `<option value="${escapeHtml(choice)}" ${selected.includes(choice) ? "selected" : ""}>${escapeHtml(choice)}</option>`).join("");
      const empty = multiple ? "" : `<option value="" ${selected.length ? "" : "selected"}>—</option>`;
      return `<select ${baseAttrs} ${multiple ? "multiple" : ""}>${empty}${options}</select>`;
    }
    if ((baseType === "Ref" || baseType === "RefList") && meta?.refTableId && refOptionsCache.has(refOptionsKey(meta))) {
      const multiple = baseType === "RefList";
      const selected = selectedRefValues(raw, multiple);
      const options = (refOptionsCache.get(refOptionsKey(meta)) || []).map((option) => `<option value="${escapeHtml(option.value)}" ${selected.includes(option.value) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
      const empty = multiple ? "" : `<option value="" ${selected.length ? "" : "selected"}>—</option>`;
      return `<select ${baseAttrs} ${multiple ? "multiple" : ""}>${empty}${options}</select>`;
    }
    if (field === "progress" || baseType === "Numeric" || baseType === "Int" || baseType === "Ref") {
      const attrs = field === "progress" ? 'min="0" max="100" step="1"' : 'step="any"';
      return `<input ${baseAttrs} type="number" ${attrs} value="${escapeHtml(raw ?? value ?? "")}" />`;
    }
    if (baseType === "Bool") {
      const checked = raw === true || String(raw).toLowerCase() === "true" || String(raw).toLowerCase() === "oui" || String(raw) === "1";
      return `<select ${baseAttrs}><option value="false" ${checked ? "" : "selected"}>Non</option><option value="true" ${checked ? "selected" : ""}>Oui</option></select>`;
    }
    return `<input ${baseAttrs} type="text" value="${escapeHtml(raw ?? value ?? "")}" />`;
  }

  const tableViewDomState = {
    headerSignature: null
  };

  function tableHeaderSignature(tableFields) {
    return JSON.stringify({
      fields: tableFields.map(({ field, label, width }) => ({ field, label, width })),
      filters: tableColumnFilters,
      openFilter: openTableFilterField
    });
  }

  function renderTableHeader(tableEl, tableFields) {
    const signature = tableHeaderSignature(tableFields);
    let thead = tableEl.tHead;
    if (!thead) thead = tableEl.createTHead();
    if (tableViewDomState.headerSignature === signature && thead.rows.length) return;
    const header = tableFields.map(renderTableHeaderCell).join("") + '<th style="width:180px">Actions</th>';
    thead.innerHTML = `<tr>${header}</tr>`;
    tableViewDomState.headerSignature = signature;
  }

  function renderTableBodyRow(node, tableFields) {
    const color = getColorForNode(node);
    const pad = 10 + (node.level - 1) * 24;
    const toggle = `<button type="button" class="table-expander" data-table-toggle="${escapeHtml(node.id)}" ${node.children.length ? "" : "disabled"}>${node.children.length ? (isNodeExpanded(node) ? "▾" : "▸") : ""}</button>`;
    const cells = tableFields.map((col, index) => {
      if (col.field === "name") {
        const nameCell = `<div class="table-name-cell" style="padding-left:${pad}px"><span class="level-pill" style="background:${escapeHtml(color)}"></span>${toggle}<span class="table-level-label">N${node.level}</span>${buildTableInput(node, "name")}</div>`;
        return `<td>${nameCell}</td>`;
      }
      if (index === 0) {
        const labelCell = `<div class="table-name-cell" style="padding-left:${pad}px"><span class="level-pill" style="background:${escapeHtml(color)}"></span>${toggle}<span class="table-level-label">N${node.level}</span>${buildTableInput(node, col.field)}</div>`;
        return `<td>${labelCell}</td>`;
      }
      return `<td>${buildTableInput(node, col.field)}</td>`;
    });
    const canAddChild = node.level < 3 && canAddLevel(node.level + 1);
    const addAction = node.level < 3
      ? `<button type="button" class="btn btn-small row-add-btn" data-add-child="${escapeHtml(node.id)}" ${canAddChild ? "" : "disabled"}>+ Niveau ${node.level + 1}</button>`
      : "";
    const deleteAction = `<button type="button" class="btn btn-small row-delete-btn" data-delete-node="${escapeHtml(node.id)}" ${canDeleteNode(node) ? "" : "disabled"}>Supprimer</button>`;
    return `<tr class="level-${node.level}${selectedNodeId === node.id ? " selected" : ""}" data-node-id="${escapeHtml(node.id)}">${cells.join("")}<td class="table-actions-cell">${addAction}${deleteAction}</td></tr>`;
  }

  function tableRowElementFromHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function renderTableBody(tbody, rows, range, tableFields) {
    const colSpan = tableFields.length + 1;
    const renderedRows = rows.slice(range.start, range.end);
    const existingRowsById = new Map(Array.from(tbody.querySelectorAll("tr[data-node-id]")).map((row) => [row.dataset.nodeId, row]));
    const activeEditor = hierarchyTableWrapEl.contains(document.activeElement) && document.activeElement?.matches?.(".table-cell-editor")
      ? document.activeElement
      : null;
    const nextNodes = [];

    if (range.topSpacer) {
      nextNodes.push(tableRowElementFromHtml(`<tr class="virtual-table-spacer" aria-hidden="true"><td colspan="${colSpan}" style="height:${range.topSpacer}px;padding:0;border:0"></td></tr>`));
    }

    for (const node of renderedRows) {
      const html = renderTableBodyRow(node, tableFields);
      const existing = existingRowsById.get(String(node.id));
      const keepActiveEdit = Boolean(activeEditor && existing?.contains(activeEditor));
      nextNodes.push(existing && (keepActiveEdit || existing.outerHTML === html) ? existing : tableRowElementFromHtml(html));
    }

    if (range.bottomSpacer) {
      nextNodes.push(tableRowElementFromHtml(`<tr class="virtual-table-spacer" aria-hidden="true"><td colspan="${colSpan}" style="height:${range.bottomSpacer}px;padding:0;border:0"></td></tr>`));
    }

    tbody.replaceChildren(...nextNodes);
  }

  function renderTableView() {
    if (!hierarchyTableWrapEl) return;
    const rows = visibleTableRows();
    const range = visibleRangeForContainer(hierarchyTableWrapEl, rows.length, TABLE_ROW_HEIGHT);
    renderTableFieldSelect();
    if (taskCountEl) taskCountEl.textContent = `${allRecords.length} élément(s)`;
    if (!rows.length) {
      hierarchyTableWrapEl.innerHTML = '<div class="table-empty">Aucun élément à afficher.</div>';
      tableViewDomState.headerSignature = null;
      return;
    }
    scheduleTableReferenceRefresh(rows);
    tableColumnFilters = sanitizeTableColumnFilters(tableColumnFilters);
    const tableFields = visibleTableFieldDefs();
    let tableEl = hierarchyTableWrapEl.querySelector(":scope > table.hierarchy-table");
    if (!tableEl) {
      hierarchyTableWrapEl.innerHTML = '<table class="hierarchy-table"><thead></thead><tbody></tbody></table>';
      tableEl = hierarchyTableWrapEl.querySelector(":scope > table.hierarchy-table");
      tableViewDomState.headerSignature = null;
    }
    renderTableHeader(tableEl, tableFields);
    renderTableBody(tableEl.tBodies[0] || tableEl.createTBody(), rows, range, tableFields);
  }

  function readTableEditValue(input) {
    if (input.tagName === "SELECT" && input.multiple) return Array.from(input.selectedOptions).map((option) => option.value);
    return input.value;
  }

  async function updateTableField(node, field, rawValue) {
    if (!allowEditing) throw new Error("L’édition est bloquée.");
    if (field === "start" || field === "end") {
      const sourceCol = fieldSourceColumn(node, field);
      if (!sourceCol) throw new Error("Aucune colonne source n’est configurée pour cette date.");
      const nextDate = normalizeDate(rawValue);
      await writeNodeFields(node, { [sourceCol]: nextDate ? toGristDateString(nextDate) : null }, FIELD_LABELS[field] || field);
      await refreshAfterWrite(node, field, nextDate ? toGristDateString(nextDate) : null);
      return;
    }
    await updateTooltipField(node, field, rawValue);
  }

  function canAddLevel(level) {
    const cfg = directMappingConfig.levels[level];
    if (!allowEditing || !cfg?.tableId || !cfg.nameCol) return false;
    if (level > 1 && !cfg.parentCol) return false;
    return true;
  }

  function canDeleteNode(node) {
    return !!(allowEditing && node?.source?.tableId && node.source.rowId != null);
  }

  function parentValueForAdd(level, parentNode) {
    if (level <= 1) return null;
    const cfg = directMappingConfig.levels[level];
    const meta = cfg?.parentCol ? sourceColumnMetaCache.get(metadataKey(cfg.tableId, cfg.parentCol)) : null;
    const parentId = parentNode?.source?.rowId;
    if (parentId == null) throw new Error("Le parent n’a pas de ligne source identifiable.");
    return baseGristType(meta?.type) === "RefList" ? ["L", parentId] : parentId;
  }

  async function deleteDirectItem(node) {
    if (!canDeleteNode(node)) throw new Error("Autorisez l’édition et vérifiez que la ligne source est identifiable avant de supprimer.");
    const hasChildren = !!node.children?.length;
    const childWarning = hasChildren ? "\n\nAttention : cet élément contient des sous-éléments. Seule cette ligne sera supprimée ; vérifiez les lignes enfants après suppression." : "";
    const confirmed = window.confirm(`Supprimer définitivement « ${node.label || "cet élément"} » ?${childWarning}`);
    if (!confirmed) return false;
    await grist.docApi.applyUserActions([["RemoveRecord", node.source.tableId, node.source.rowId]]);
    setDebugSyncMode("docApi.applyUserActions (suppression table source)");
    setDebugAction(`Remove ${node.source.tableId}#${node.source.rowId}`);
    invalidateSourceTableRows(node.source.tableId, "suppression");
    if (selectedNodeId === node.id) selectedNodeId = null;
    hideTooltip();
    await DataModel.loadAndRenderDirectMapping();
    showToast("Élément supprimé définitivement", "success");
    return true;
  }

  async function addDirectItem(level, parentNode = null) {
    if (!canAddLevel(level)) throw new Error(level === 1
      ? "Configurez la table et la colonne titre du niveau 1, puis autorisez l’édition."
      : `Configurez la table, la colonne titre et le parent du niveau ${level}, puis autorisez l’édition.`);
    const cfg = directMappingConfig.levels[level];
    const fields = { [cfg.nameCol]: `Nouveau niveau ${level}` };
    if (level > 1) fields[cfg.parentCol] = parentValueForAdd(level, parentNode);
    await grist.docApi.applyUserActions([["AddRecord", cfg.tableId, null, fields]]);
    setDebugSyncMode("docApi.applyUserActions (ajout table source)");
    setDebugAction(`Add ${cfg.tableId}: ${Object.keys(fields).join(", ")}`);
    invalidateSourceTableRows(cfg.tableId, "ajout");
    if (parentNode) expandedNodes[parentNode.id] = true;
    await DataModel.loadAndRenderDirectMapping();
    showToast(`Niveau ${level} ajouté`, "success");
  }

  function render() {
    updateViewModeButtons();
    if (!allRecords.length) {
      taskListEl.innerHTML = '<div class="empty">En attente du mapping interne…</div>';
      timelineGridEl.innerHTML = "";
      yearsRowEl.innerHTML = monthsRowEl.innerHTML = weeksRowEl.innerHTML = daysRowEl.innerHTML = "";
      currentPeriodEl.textContent = "–";
      taskCountEl.textContent = "";
      if (hierarchyTableWrapEl) hierarchyTableWrapEl.innerHTML = '<div class="table-empty">En attente du mapping interne…</div>';
      updateExpandAllButton();
      return;
    }
    initColorFieldSelect();
    if (viewMode === "timeline") {
      ensureTimelineScrollSync();
      flatTracks = buildTracks();
      TimelineView.buildHeaders();
      TimelineView.renderTaskList();
      TimelineView.renderTimeline();
    } else {
      TableView.renderTableView();
    }
    refreshTableInfo();
    updateExpandAllButton();
  }


  function setViewMode(mode) {
    viewMode = mode;
    hideTooltip();
    saveState();
    render();
  }

  function toggleEditing() {
    allowEditing = !allowEditing;
    updateEditButtons();
    if (!allowEditing && tooltipState.editingField) {
      tooltipState.editingField = null;
      tooltipState.draftValue = null;
      refreshActiveTooltip();
    }
    saveState();
  }

  function toggleAllNodes() {
    const shouldExpand = !areAllCollapsibleNodesExpanded();
    allRecords.forEach((n) => { if (n.children.length) expandedNodes[n.id] = shouldExpand; });
    saveState();
    render();
  }

  async function handleAddLevel1() {
    try {
      await addDirectItem(1);
    } catch (err) {
      console.error(err);
      showToast(err.message || "Erreur lors de l’ajout", "error");
    }
  }

  function bindTableHandlers() {
    tableAddLevel1Btn?.addEventListener("click", handleAddLevel1);
    hierarchyTableWrapEl?.addEventListener("scroll", () => {
      if (viewMode !== "table") return;
      window.requestAnimationFrame(() => renderTableView());
    }, { passive: true });

    hierarchyTableWrapEl?.addEventListener("click", async (e) => {
      const filterToggle = e.target.closest("[data-table-filter-toggle]");
      if (filterToggle) {
        e.stopPropagation();
        const field = filterToggle.dataset.tableFilterToggle;
        openTableFilterField = openTableFilterField === field ? null : field;
        renderTableView();
        return;
      }

      const filterAll = e.target.closest("[data-table-filter-all]");
      if (filterAll) {
        e.stopPropagation();
        delete tableColumnFilters[filterAll.dataset.tableFilterAll];
        saveState();
        renderTableView();
        return;
      }

      const filterClear = e.target.closest("[data-table-filter-clear]");
      if (filterClear) {
        e.stopPropagation();
        delete tableColumnFilters[filterClear.dataset.tableFilterClear];
        saveState();
        renderTableView();
        return;
      }

      if (e.target.closest("[data-table-filter-menu]")) {
        e.stopPropagation();
        return;
      }

      openTableFilterField = null;

      const toggle = e.target.closest("[data-table-toggle]");
      if (toggle) {
        const node = nodeById.get(toggle.dataset.tableToggle);
        if (!node) return;
        expandedNodes[node.id] = !isNodeExpanded(node);
        saveState();
        render();
        return;
      }

      const deleteBtn = e.target.closest("[data-delete-node]");
      if (deleteBtn) {
        const node = nodeById.get(deleteBtn.dataset.deleteNode);
        if (!node) return;
        try {
          await deleteDirectItem(node);
        } catch (err) {
          console.error(err);
          showToast(err.message || "Erreur lors de la suppression", "error");
        }
        return;
      }

      const addBtn = e.target.closest("[data-add-child]");
      if (addBtn) {
        const parent = nodeById.get(addBtn.dataset.addChild);
        if (!parent) return;
        try {
          await addDirectItem(parent.level + 1, parent);
        } catch (err) {
          console.error(err);
          showToast(err.message || "Erreur lors de l’ajout", "error");
        }
        return;
      }

      const row = e.target.closest("tr[data-node-id]");
      if (row && !e.target.closest(".table-cell-editor")) selectNodeByIdForLinkedViews(row.dataset.nodeId);
    });

    hierarchyTableWrapEl?.addEventListener("change", async (e) => {
      const filterInput = e.target.closest('[data-table-filter-menu] input[type="checkbox"]');
      if (filterInput) {
        const menu = filterInput.closest("[data-table-filter-menu]");
        const field = menu?.dataset.tableFilterMenu;
        if (!field) return;
        const selected = Array.from(menu.querySelectorAll('input[type="checkbox"]:checked')).map((option) => option.value);
        if (selected.length) tableColumnFilters[field] = selected;
        else delete tableColumnFilters[field];
        tableColumnFilters = sanitizeTableColumnFilters(tableColumnFilters);
        openTableFilterField = field;
        saveState();
        renderTableView();
        return;
      }

      const input = e.target.closest(".table-cell-editor");
      if (!input) return;
      const node = nodeById.get(input.dataset.nodeId);
      const field = input.dataset.field;
      if (!node || !field) return;
      try {
        await updateTableField(node, field, readTableEditValue(input));
        showToast("Champ mis à jour dans la table source", "success");
      } catch (err) {
        console.error(err);
        showToast(err.message || "Erreur lors de la mise à jour", "error");
        renderTableView();
      }
    });

    hierarchyTableWrapEl?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches(".table-cell-editor")) {
        e.preventDefault();
        e.target.blur();
      }
      if (e.key === "Escape" && e.target.matches(".table-cell-editor")) renderTableView();
    });
  }

  // Modules internes : chaque façade regroupe un périmètre fonctionnel tout en conservant
  // un seul fichier widget.js chargé par index.html pour le widget Grist.
  const DataModel = Object.freeze({
    buildDirectMultitableRecords,
    loadAndRenderDirectMapping,
    directNodeFromRow,
    writeNodeFields,
    loadSourceColumnMetadata,
    rowsFromGristTable,
    sourceColumnMeta,
    computeGlobalRange,
    finalizeTreeDates
  });

  const TimelineView = Object.freeze({
    buildTracks,
    buildHeaders,
    renderTaskList,
    renderTimeline,
    showTooltip,
    hideTooltip,
    refreshActiveTooltip,
    attachBarDrag,
    attachMilestoneDrag,
    onDragMove,
    onDragEnd
  });

  const TableView = Object.freeze({
    visibleTableRows,
    renderTableFieldSelect,
    buildTableInput,
    renderTableView,
    bindHandlers: bindTableHandlers,
    readTableEditValue,
    updateTableField
  });

  const Controller = Object.freeze({
    render,
    setViewMode,
    toggleEditing,
    toggleAllNodes,
    handleAddLevel1,
    get viewMode() { return viewMode; }
  });

  timelineViewBtn?.addEventListener("click", () => Controller.setViewMode("timeline"));
  tableViewBtn?.addEventListener("click", () => Controller.setViewMode("table"));
  addLevel1Btn?.addEventListener("click", Controller.handleAddLevel1);
  TableView.bindHandlers();

  if (tooltipEl) {
    tooltipEl.addEventListener("mouseenter", () => cancelTooltipHide());
    tooltipEl.addEventListener("mouseleave", () => scheduleTooltipHide(80));

    tooltipEl.addEventListener("click", async (e) => {
      e.stopPropagation();
      const node = tooltipState.nodeId ? nodeById.get(tooltipState.nodeId) : null;
      if (!node) return;
      const input = e.target.closest("[data-edit-input]");
      if (input) return;

      const saveBtn = e.target.closest(".tooltip-save");
      if (saveBtn) {
        if (!allowEditing) {
          showToast("L’édition est bloquée", "error");
          return;
        }
        const activeInput = tooltipEl.querySelector("[data-edit-input]");
        try {
          await updateTooltipField(node, tooltipState.editingField, readTooltipEditValue(activeInput));
          tooltipState.editingField = null;
          tooltipState.draftValue = null;
          showToast("Champ mis à jour dans la table source", "success");
          hideTooltip();
        } catch (err) {
          console.error(err);
          showToast(err.message || "Erreur lors de la mise à jour", "error");
        }
        return;
      }

      const row = e.target.closest(".tooltip-edit-row.editable");
      if (!row || !allowEditing) return;
      const field = row.dataset.field;
      if (field === "start") {
        try {
          await updateTooltipField(node, "start", "");
          showToast("Date de début créée : le jalon devient une tâche", "success");
          hideTooltip();
        } catch (err) {
          console.error(err);
          showToast(err.message || "Erreur lors de la mise à jour", "error");
        }
        return;
      }
      const rowInfo = editableTooltipRows(node).find((info) => info.field === field);
      const baseType = baseGristType(rowInfo?.meta?.type);
      if ((baseType === "Ref" || baseType === "RefList") && rowInfo?.meta?.refTableId) {
        try { await loadRefOptions(rowInfo.meta); }
        catch (err) { console.warn("Impossible de charger les options de référence :", err); }
      }
      tooltipState.editingField = field;
      tooltipState.draftValue = rawValueForField(node, field);
      refreshActiveTooltip();
    });

    tooltipEl.addEventListener("input", (e) => {
      if (e.target.matches("[data-edit-input]")) tooltipState.draftValue = readTooltipEditValue(e.target);
    });

    tooltipEl.addEventListener("change", (e) => {
      if (e.target.matches("[data-edit-input]")) tooltipState.draftValue = readTooltipEditValue(e.target);
    });

    tooltipEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches("[data-edit-input]")) {
        e.preventDefault();
        tooltipEl.querySelector(".tooltip-save")?.click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        tooltipState.editingField = null;
        tooltipState.draftValue = null;
        refreshActiveTooltip();
      }
    });
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest(".gantt-bar, .gantt-milestone, .gantt-zero-duration, #tooltip")) return;
    hideTooltip();
  });

  document.querySelectorAll(".zoom-controls .btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      zoomMode = btn.dataset.zoom;
      updateZoomButtons();
      setVisibleRangeForZoom();
      saveState();
      render();
    });
  });

  prevBtn.addEventListener("click", () => shiftVisibleRange("left"));
  nextBtn.addEventListener("click", () => shiftVisibleRange("right"));
  todayBtn.addEventListener("click", () => { setVisibleRangeForZoom(); saveState(); render(); });
  toggleSidebarBtn.addEventListener("click", () => {
    const collapsed = ganttContainer.classList.toggle("sidebar-collapsed");
    toggleSidebarBtn.textContent = collapsed ? "Afficher liste" : "Masquer liste";
  });
  toggleLabelsBtn.addEventListener("click", () => {
    labelsVisible = !labelsVisible;
    toggleLabelsBtn.textContent = labelsVisible ? "Masquer labels" : "Afficher labels";
    saveState();
    render();
  });
  groupChildrenBtn.addEventListener("click", () => {
    compactChildren = !compactChildren;
    groupChildrenBtn.textContent = compactChildren ? "Niveaux bas : 1 ligne" : "Niveaux bas : multi-lignes";
    saveState();
    render();
  });
  toggleDateEditBtn.addEventListener("click", toggleEditing);
  tableToggleEditBtn?.addEventListener("click", toggleEditing);
  timelineDateSortSelect?.addEventListener("change", (e) => {
    const nextSort = isValidDateSortField(e.target.value) ? e.target.value : "default";
    timelineSortField = nextSort;
    flatTracks = [];
    saveState();
    render();
  });
  expandAllBtn.addEventListener("click", toggleAllNodes);
  tableExpandAllBtn?.addEventListener("click", toggleAllNodes);
  colorFieldSelect.addEventListener("change", (e) => { colorField = e.target.value; saveState(); render(); });
  tableFieldSelectBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = tableFieldSelectBtn.getAttribute("aria-expanded") === "true";
    tableFieldSelectBtn.setAttribute("aria-expanded", String(!isOpen));
    if (tableFieldSelect) tableFieldSelect.hidden = isOpen;
    tableFieldPickerEl?.classList.toggle("open", !isOpen);
  });
  tableFieldSelect?.addEventListener("click", (e) => e.stopPropagation());
  tableFieldSelect?.addEventListener("change", () => {
    tableVisibleFields = Array.from(tableFieldSelect.querySelectorAll('input[type="checkbox"]:checked')).map((option) => option.value);
    tableVisibleFields = sanitizeTableVisibleFields(tableVisibleFields);
    pruneHiddenTableFilters();
    saveState();
    if (viewMode === "table") renderTableView();
  });
  document.addEventListener("click", (e) => {
    if (!hierarchyTableWrapEl?.contains(e.target)) {
      openTableFilterField = null;
      if (viewMode === "table" && hierarchyTableWrapEl?.querySelector(".table-column-filter.open")) renderTableView();
    }
    if (tableFieldPickerEl?.contains(e.target)) return;
    if (tableFieldSelectBtn) tableFieldSelectBtn.setAttribute("aria-expanded", "false");
    if (tableFieldSelect) tableFieldSelect.hidden = true;
    tableFieldPickerEl?.classList.remove("open");
  });
  window.addEventListener("resize", () => {
    if (!allRecords.length) return;
    if (zoomMode === "day") keepOrRecomputeVisibleRange();
    render();
  });

  function renderDirectMappingPanel() {
    if (!mappingPanelEl) return;
    const levelBlocks = LEVELS.map((levelInfo) => {
      const cfg = directMappingConfig.levels[levelInfo.level];
      const tableId = cfg.tableId || "";
      const dateTypes = ["Date", "DateTime"];
      const refTypes = ["Ref", "RefList", "Int", "Numeric"];
      const parentRow = levelInfo.level === 1 ? "" : `
        <div class="row"><label>${escapeHtml(levelInfo.label)} — parent niveau ${levelInfo.level - 1}</label><select data-direct-level="${levelInfo.level}" data-direct-field="parentCol">${columnOptionsHtml(tableId, cfg.parentCol, { onlyTypes: refTypes })}</select></div>`;
      const extraRows = (cfg.extraFields || []).map((extra) => `
        <div class="row mapping-extra-row" data-extra-id="${escapeHtml(extra.id)}">
          <label>Champ libre</label>
          <div class="mapping-extra-controls">
            <input type="text" placeholder="Nom affiché" value="${escapeHtml(extra.label)}" data-direct-level="${levelInfo.level}" data-extra-id="${escapeHtml(extra.id)}" data-extra-prop="label" />
            <select data-direct-level="${levelInfo.level}" data-extra-id="${escapeHtml(extra.id)}" data-extra-prop="colId">${columnOptionsHtml(tableId, extra.colId)}</select>
            <button type="button" class="btn btn-small" data-remove-extra-field="${escapeHtml(extra.id)}" data-direct-level="${levelInfo.level}">Retirer</button>
          </div>
        </div>`).join("");
      return `
        <fieldset class="mapping-level">
          <legend>${escapeHtml(levelInfo.label)}${levelInfo.required ? " (racine)" : ""}</legend>
          <div class="row"><label>Table source</label><select data-direct-level="${levelInfo.level}" data-direct-field="tableId">${tableOptionsHtml(tableId)}</select></div>
          ${parentRow}
          <div class="row"><label>Titre</label><select data-direct-level="${levelInfo.level}" data-direct-field="nameCol">${columnOptionsHtml(tableId, cfg.nameCol)}</select></div>
          <div class="row"><label>Date début</label><select data-direct-level="${levelInfo.level}" data-direct-field="startCol">${columnOptionsHtml(tableId, cfg.startCol, { onlyTypes: dateTypes })}</select></div>
          <div class="row"><label>Date fin</label><select data-direct-level="${levelInfo.level}" data-direct-field="endCol">${columnOptionsHtml(tableId, cfg.endCol, { onlyTypes: dateTypes })}</select></div>
          <div class="row"><label>Statut</label><select data-direct-level="${levelInfo.level}" data-direct-field="statusCol">${columnOptionsHtml(tableId, cfg.statusCol)}</select></div>
          <div class="row"><label>Responsable</label><select data-direct-level="${levelInfo.level}" data-direct-field="responsibleCol">${columnOptionsHtml(tableId, cfg.responsibleCol)}</select></div>
          <div class="row"><label>Avancement</label><select data-direct-level="${levelInfo.level}" data-direct-field="progressCol">${columnOptionsHtml(tableId, cfg.progressCol)}</select></div>
          ${extraRows}
          <div class="mapping-actions"><button type="button" class="btn btn-small" data-add-extra-field="${levelInfo.level}">+ Ajouter un champ</button></div>
        </fieldset>`;
    }).join("");

    mappingPanelEl.innerHTML = `
      <div><strong>Mapping interne multitable</strong> : choisissez une table source par niveau, puis les champs à lire et à modifier. Le niveau 2 doit pointer vers le niveau 1, et le niveau 3 vers le niveau 2, via une colonne parent.</div>
      ${levelBlocks}
      <div class="mapping-actions">
        <button class="btn btn-small" id="reloadDirectMappingBtn">Recharger depuis les tables</button>
        <button class="btn btn-small" id="resetManualMappingBtn">Réinitialiser mapping interne</button>
      </div>
      <div class="mapping-hint">Le widget utilise uniquement ce mapping interne pour identifier les lignes et colonnes sources ; le mapping natif Grist n’est plus requis.</div>
    `;
  }

  async function ensureDirectMappingPanelReady() {
    await loadSourceColumnMetadata();
    let changed = false;
    for (const levelInfo of LEVELS) {
      const cfg = directMappingConfig.levels[levelInfo.level];
      const hasManualFields = DIRECT_FIELDS.some((field) => cfg?.[`${field}Col`]);
      if (cfg?.tableId && !hasManualFields) changed = automapDirectLevelConfig(cfg) || changed;
    }
    if (changed) saveDirectMappingConfig();
    renderDirectMappingPanel();
  }

  if (mappingPanelEl) {
    mappingPanelEl.addEventListener("change", async (e) => {
      const select = e.target.closest("[data-direct-level][data-direct-field]");
      if (!select) return;
      const level = Number(select.dataset.directLevel);
      const field = select.dataset.directField;
      const cfg = directMappingConfig.levels[level];
      if (!cfg) return;
      cfg[field] = select.value;
      if (field === "tableId") {
        for (const directField of ["parentCol", ...DIRECT_FIELDS.map((name) => `${name}Col`)]) cfg[directField] = "";
        cfg.extraFields = [];
        automapDirectLevelConfig(cfg);
      }
      saveDirectMappingConfig();
      directMappingModeActive = hasDirectMappingConfig(directMappingConfig);
      renderDirectMappingPanel();
      await DataModel.loadAndRenderDirectMapping();
    });

    mappingPanelEl.addEventListener("input", (e) => {
      const input = e.target.closest("[data-direct-level][data-extra-id][data-extra-prop]");
      if (!input) return;
      const cfg = directMappingConfig.levels[Number(input.dataset.directLevel)];
      const extra = cfg?.extraFields?.find((field) => field.id === input.dataset.extraId);
      if (!extra) return;
      extra[input.dataset.extraProp] = input.value;
      saveDirectMappingConfig();
    });

    mappingPanelEl.addEventListener("change", async (e) => {
      const input = e.target.closest("[data-direct-level][data-extra-id][data-extra-prop]");
      if (!input) return;
      const cfg = directMappingConfig.levels[Number(input.dataset.directLevel)];
      const extra = cfg?.extraFields?.find((field) => field.id === input.dataset.extraId);
      if (!extra) return;
      extra[input.dataset.extraProp] = input.value;
      saveDirectMappingConfig();
      renderDirectMappingPanel();
      await DataModel.loadAndRenderDirectMapping();
    });

    mappingPanelEl.addEventListener("click", async (e) => {
      const addExtraBtn = e.target.closest("[data-add-extra-field]");
      if (addExtraBtn) {
        const level = Number(addExtraBtn.dataset.addExtraField);
        const cfg = directMappingConfig.levels[level];
        const id = `extra_${level}_${Date.now()}`;
        cfg.extraFields.push({ id, label: "", colId: "" });
        saveDirectMappingConfig();
        renderDirectMappingPanel();
        return;
      }
      const removeExtraBtn = e.target.closest("[data-remove-extra-field]");
      if (removeExtraBtn) {
        const level = Number(removeExtraBtn.dataset.directLevel);
        const cfg = directMappingConfig.levels[level];
        cfg.extraFields = (cfg.extraFields || []).filter((field) => field.id !== removeExtraBtn.dataset.removeExtraField);
        tableVisibleFields = sanitizeTableVisibleFields(tableVisibleFields);
        saveDirectMappingConfig();
        saveState();
        renderDirectMappingPanel();
        await DataModel.loadAndRenderDirectMapping();
        return;
      }
      if (e.target.closest("#resetManualMappingBtn")) {
        directMappingConfig = normalizeDirectMappingConfig({});
        saveDirectMappingConfig();
        directMappingModeActive = false;
        renderDirectMappingPanel();
        showToast("Mapping interne réinitialisé", "success");
        return;
      }
      if (e.target.closest("#reloadDirectMappingBtn")) await DataModel.loadAndRenderDirectMapping();
    });
  }

  if (toggleMappingPanelBtn && mappingPanelEl && debugPanelEl) {
    toggleMappingPanelBtn.textContent = "Mapping";
    toggleMappingPanelBtn.addEventListener("click", async () => {
      const shouldShow = mappingPanelEl.hasAttribute("hidden");
      for (const panel of [debugPanelEl, mappingPanelEl]) {
        if (shouldShow) panel.removeAttribute("hidden");
        else panel.setAttribute("hidden", "hidden");
      }
      toggleMappingPanelBtn.classList.toggle("active", shouldShow);
      toggleMappingPanelBtn.textContent = shouldShow ? "Masquer mapping" : "Mapping";
      if (shouldShow) {
        try { await ensureDirectMappingPanelReady(); }
        catch (err) { console.error(err); showToast("Impossible de charger les tables Grist", "error"); }
      }
    });
  }

  updateEditButtons();
  toggleLabelsBtn.textContent = labelsVisible ? "Masquer labels" : "Afficher labels";
  groupChildrenBtn.textContent = compactChildren ? "Niveaux bas : 1 ligne" : "Niveaux bas : multi-lignes";
  updateExpandAllButton();
  updateZoomButtons();

  grist.ready({ requiredAccess: "full", allowSelectBy: true });

  grist.onOptions(function (options) {
    const widgetState = options?.[WIDGET_STATE_OPTION_KEY];
    const optionMapping = options?.[DIRECT_MAPPING_OPTION_KEY];
    let shouldRender = false;

    if (optionMapping) {
      directMappingConfig = normalizeDirectMappingConfig(optionMapping);
      directMappingModeActive = hasDirectMappingConfig(directMappingConfig);
      saveDirectMappingConfigToLocalStorage(directMappingConfig);
      renderDirectMappingPanel();
      shouldRender = true;
    } else if (hasDirectMappingConfig(directMappingConfig)) {
      // Migration automatique : si le mapping n'existe encore que dans localStorage,
      // on le copie dans les options propres à cette instance de widget Grist.
      saveDirectMappingConfigOption(directMappingConfig);
    }

    if (widgetState) {
      applyState(widgetState, { includeViewMode: true });
      try {
        saveStateToLocalStorage(serializedState());
      } catch (e) {
        console.warn("Impossible de synchroniser l’état local depuis les options Grist :", e);
      }
      shouldRender = true;
    }

    if (shouldRender) render();
  });

  grist.onRecords(async function (records) {
    setDebugStatus(`onRecords reçu: ${records ? records.length : 0} ligne(s)`);
    const previousViewSignature = currentTableId ? `${currentTableId}:${currentViewRowIdSignature()}` : null;
    currentViewRecords = Array.isArray(records) ? records : [];
    try {
      currentTableId = await grist.selectedTable.getTableId();
    } catch (e) {
      currentTableId = null;
    }
    const nextViewSignature = currentTableId ? `${currentTableId}:${currentViewRowIdSignature()}` : null;
    if (previousViewSignature !== nextViewSignature) directHierarchyDirty = true;

    if (await DataModel.loadAndRenderDirectMapping()) return;

    allRecords = [];
    treeRoots = [];
    flatTracks = [];
    nodeById = new Map();
    globalMinDate = null;
    globalMaxDate = null;
    setDebugStatus("Mapping interne à configurer");
    render();
    refreshTableInfo();
  });
})();
