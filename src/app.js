/*
 * IPP demo UI: an overview page plus four simulated role views over one shared, browser-local store.
 * Every user-supplied string is rendered as a text node (never as HTML).
 *
 * Render model: every user action runs inside act(), which pauses the store's change notification,
 * so the handler can finish updating UI state and then render exactly once. Changes from another
 * browser tab arrive through the store subscription and render normally.
 */
(function () {
  'use strict';

  const Store = window.IPPStore;
  const { h, icon, orgTile, avatar, timeEl, refreshRelativeTimes } = window.IPPUI;
  const store = Store.createStore(Store.browserStorage());
  const { OPPORTUNITY_STATUS, PLACEMENT_STATUS, WORK_MODES, LIMITS } = Store;

  const STUDENT_ID = 'STU-001'; // simulated sign-in: the demo always acts as this student
  const DEFAULT_ROUTE = 'overview'; // set to 'student' to open on the Student view instead

  const OVERVIEW = { id: 'overview', label: 'Overview', short: 'Overview', hint: 'Journey and live activity', icon: 'home' };
  // Ordered by the end-to-end journey.
  const ROLES = [
    { id: 'employer', label: 'Employer HR', short: 'Employer', hint: '1 · Submit, view applicants', icon: 'briefcase' },
    { id: 'admin', label: 'University Administrator', short: 'Admin', hint: '2 · Review and approve', icon: 'shield' },
    { id: 'student', label: 'Student', short: 'Student', hint: '3 · Browse and apply', icon: 'cap' },
    { id: 'faculty', label: 'Faculty Reviewer', short: 'Faculty', hint: '4 · View applications', icon: 'book' },
  ];
  const ROUTES = [OVERVIEW, ...ROLES];
  const ACTIVITY_ICON = { employer: 'briefcase', admin: 'shield', student: 'cap', faculty: 'book', system: 'reset' };
  const STUDENT_TABS = [
    { id: 'opportunities', label: 'Opportunities', icon: 'search' },
    { id: 'applications', label: 'My applications', icon: 'inbox' },
    { id: 'profile', label: 'My profile', icon: 'user' },
  ];
  const EMPLOYER_TABS = [
    { id: 'submit', label: 'Opportunities', icon: 'briefcase' },
    { id: 'applicants', label: 'Applicants', icon: 'inbox' },
  ];
  const ROLE_TABS = { student: STUDENT_TABS, employer: EMPLOYER_TABS };

  // Fictional organizations, used by "Fill sample data" so repeated demos do not repeat one listing.
  const SAMPLE_DRAFTS = [
    {
      organization_name: 'Harbor Robotics',
      title: 'Controls Engineering Intern',
      description: 'Help test motion-control firmware on a lab rig and document the results for the engineering team.',
      location: 'Abu Dhabi',
      work_mode: 'On-site',
      duration: '8 weeks',
    },
    {
      organization_name: 'Atlas Health Labs',
      title: 'UX Research Intern',
      description: 'Plan and run usability sessions for a patient-scheduling tool and present findings to the product team.',
      location: 'Remote',
      work_mode: 'Remote',
      duration: '10 weeks',
    },
    {
      organization_name: 'Cedar Ledger Partners',
      title: 'Risk Analytics Intern',
      description: 'Build dashboards that track portfolio risk indicators and explain trends to non-technical colleagues.',
      location: 'Dubai',
      work_mode: 'Hybrid',
      duration: '12 weeks',
    },
  ];
  const blankDraft = () => ({
    organization_name: '',
    title: '',
    description: '',
    location: '',
    work_mode: 'Hybrid',
    duration: '',
  });

  const ui = {
    route: null,
    tab: 'opportunities',
    query: '',
    workMode: 'All',
    sort: 'newest',
    hrAuthorized: true,
    draft: blankDraft(),
    errors: {},
    formMessage: '',
    sampleIndex: 0,
    nameDraft: null,
    nameError: '',
    focusId: null, // element to focus after the next render
    dialogFocusId: null, // element to focus once a dialog has closed
    pendingApply: null,
    fresh: new Set(), // record IDs to highlight once, on the next render
    seenActivity: new Set(),
    activityPrimed: false, // false until the first render, so existing entries do not all flash
    prevStats: {},
    enter: false, // true on route changes: play the entrance animation
    batch: false,
  };

  const $ = (selector) => document.querySelector(selector);

  /** Run a store action without letting its change notification trigger an early render. */
  function act(fn) {
    ui.batch = true;
    try {
      return fn();
    } finally {
      ui.batch = false;
    }
  }

  // ---------- shared building blocks ----------

  function chip(text, kind, iconName) {
    return h('span', { class: `chip chip-${kind}` }, iconName && icon(iconName, 13), text);
  }
  const approvalChip = (status) =>
    status === OPPORTUNITY_STATUS.APPROVED ? chip(status, 'approved', 'check') : chip(status, 'pending', 'clock');

  function metaChips(opportunity) {
    return h(
      'ul',
      { class: 'meta' },
      [
        ['pin', opportunity.location],
        ['monitor', opportunity.work_mode],
        ['clock', opportunity.duration],
      ].map(([iconName, text]) => h('li', null, icon(iconName, 14), text)),
    );
  }

  function facts(pairs) {
    return h('dl', { class: 'facts' }, pairs.map(([label, value]) => h('div', null, h('dt', null, label), h('dd', null, value))));
  }

  function formatTime(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function emptyState(iconName, title, text, action, compact) {
    return h(
      'div',
      { class: `empty${compact ? ' compact' : ''}` },
      h('span', { class: 'empty-icon' }, icon(iconName, 24)),
      h('p', { class: 'empty-title' }, title),
      text && h('p', null, text),
      action,
    );
  }

  function hero(eyebrow, title, text, options) {
    const opts = options || {};
    return h(
      'section',
      { class: `hero${opts.large ? ' hero-lg' : ''}` },
      opts.icon && h('div', { class: 'hero-icon' }, icon(opts.icon, 110)),
      h('p', { class: 'eyebrow' }, eyebrow),
      h('h1', { id: 'page-title', tabindex: '-1' }, title),
      h('p', null, text),
      opts.extra,
    );
  }

  /** Stat tiles. The value is always the final number; a change plays a short "bump" animation. */
  function stats(items, variant) {
    return h(
      'div',
      { class: `stats${variant ? ` ${variant}` : ''}` },
      items.map((item) => {
        const previous = ui.prevStats[item.key];
        const changed = previous !== undefined && previous !== item.value;
        ui.prevStats[item.key] = item.value;
        return h(
          'div',
          { class: 'stat' },
          h('p', { class: 'stat-label' }, item.icon && icon(item.icon, 16), item.label),
          h('p', { class: `stat-value${item.text ? ' text' : ''}` }, h('span', { class: changed ? 'bump' : null }, item.value)),
          h('p', { class: 'stat-note' }, item.note),
        );
      }),
    );
  }

  function field(spec) {
    const { id, name, label, value, error, hint, required, multiline, options, maxlength, counter } = spec;
    const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ');
    const common = {
      id,
      name,
      'aria-required': required ? 'true' : null,
      'aria-invalid': error ? 'true' : null,
      'aria-describedby': describedBy || null,
    };
    let control;
    if (options) {
      control = h('select', common, options.map((option) => h('option', { value: option, selected: option === value }, option)));
    } else if (multiline) {
      control = h('textarea', { ...common, rows: '4', maxlength }, value || '');
    } else {
      control = h('input', { ...common, type: 'text', value: value || '', maxlength, autocomplete: 'off' });
    }
    return h(
      'div',
      { class: `field${error ? ' has-error' : ''}` },
      h(
        'div',
        { class: 'field-label' },
        h('label', { for: id }, label, required && h('span', { class: 'req', 'aria-hidden': 'true' }, ' *')),
        counter && h('span', { class: 'counter', id: `${id}-count`, 'aria-hidden': 'true' }, `${(value || '').length} / ${maxlength}`),
      ),
      control,
      hint && h('p', { id: `${id}-hint`, class: 'hint' }, hint),
      error && h('p', { id: `${id}-error`, class: 'error' }, error),
    );
  }

  // ---------- toast (persistent live region) ----------

  function showToast(message, options) {
    const opts = options || {};
    $('#toast').replaceChildren(
      h(
        'div',
        { class: `toast-card${opts.error ? ' is-error' : ''}` },
        h('span', { class: 'toast-icon' }, icon(opts.error ? 'alert' : 'checkCircle', 18)),
        h('div', null, h('p', null, message), opts.link && h('a', { href: opts.link.href }, opts.link.text, icon('arrow', 14))),
        h('button', { type: 'button', class: 'toast-close', 'aria-label': 'Dismiss notification', onClick: clearToast }, icon('x', 16)),
      ),
    );
  }
  function clearToast() {
    $('#toast').replaceChildren();
  }

  // ---------- journey tracker and activity feed ----------

  function journeyCard(wide) {
    const journey = store.getJourney();
    const nextIndex = journey.stages.findIndex((stage) => !stage.done);
    const steps = journey.stages.map((stage, index) => {
      const state = stage.done ? 'is-done' : index === nextIndex ? 'is-current' : '';
      return h(
        'li',
        { class: `step ${state}` },
        h(
          'a',
          { href: `#${stage.role}`, 'aria-current': index === nextIndex ? 'step' : null },
          h('span', { class: 'step-dot' }, stage.done ? icon('check', 15) : String(index + 1)),
          h(
            'span',
            { class: 'step-text' },
            h('span', { class: 'step-label' }, stage.label),
            h('span', { class: 'step-state' }, stage.done ? 'Done' : index === nextIndex ? 'Next step' : 'Waiting'),
          ),
        ),
      );
    });
    const record = journey.opportunity
      ? h('p', { class: 'journey-record' }, 'Tracking ', h('strong', null, journey.opportunity.opportunity_id), ` · ${journey.opportunity.title} at ${journey.opportunity.organization_name}`)
      : h('p', { class: 'journey-record' }, 'No submitted record yet. Submit an opportunity as Employer HR to start the journey.');
    return h(
      'section',
      { class: `card journey${wide ? ' journey-h' : ''}`, 'aria-labelledby': 'journey-title' },
      h('div', { class: 'journey-head' }, h('h2', { class: 'card-title', id: 'journey-title' }, icon('layers', 18), 'Demo journey'), journey.complete && chip('Complete', 'approved', 'check')),
      record,
      h('ol', { class: 'steps' }, steps),
      h(
        'div',
        { class: 'journey-foot' },
        h('p', { class: 'journey-placement' }, 'Placement status', chip(journey.placement_status, 'neutral')),
        h('p', { class: 'muted' }, 'Decided separately from applying; placement decisions are deferred.'),
      ),
    );
  }

  function activityCard(limit) {
    const entries = store.listActivity(limit);
    const keyOf = (entry) => `${entry.activity_id}@${entry.at}`;
    const list = entries.length
      ? h(
          'ul',
          { class: 'activity-list' },
          entries.map((entry) =>
            h(
              'li',
              { class: `activity-item${ui.activityPrimed && !ui.seenActivity.has(keyOf(entry)) ? ' is-new' : ''}` },
              h('span', { class: `act-icon act-${entry.role}` }, icon(ACTIVITY_ICON[entry.role] || 'pulse', 16)),
              h('div', { class: 'act-text' }, entry.text, entry.ref ? ` (${entry.ref})` : '', h('span', { class: 'act-time' }, timeEl(entry.at))),
            ),
          ),
        )
      : emptyState('pulse', 'No activity yet', 'Actions in any role show up here as they happen.', null, true);
    entries.forEach((entry) => ui.seenActivity.add(keyOf(entry)));
    return h('section', { class: 'card', 'aria-labelledby': 'activity-title' }, h('h2', { class: 'card-title', id: 'activity-title' }, icon('pulse', 18), 'Recent activity'), list);
  }

  // ---------- Overview ----------

  function overviewView() {
    const counts = store.counts();
    const steps = [
      {
        role: ROLES[0],
        text: 'Submit an internship opportunity, then see who applies. It starts as Pending Review.',
        metric: `${counts.pending} pending · ${counts.applications} ${counts.applications === 1 ? 'applicant' : 'applicants'}`,
      },
      { role: ROLES[1], text: 'Review the queue and approve opportunities for students.', metric: `${counts.approved} approved` },
      { role: ROLES[2], text: 'Search approved opportunities and apply once to each.', metric: `${counts.applications} ${counts.applications === 1 ? 'application' : 'applications'}` },
      { role: ROLES[3], text: 'Inspect applications read-only. An application is not a placement.', metric: `${counts.applications} ${counts.applications === 1 ? 'record' : 'records'}` },
    ];
    const scope = (cls, iconName, title, items) =>
      h('section', { class: `card scope-card ${cls}` }, h('h3', null, icon(iconName, 18), title), h('ul', null, items.map((item) => h('li', null, item))));

    return h(
      'div',
      null,
      hero(
        'Internship Practicum Platform · Sprint 1 demo',
        'One placement journey, from opportunity to application',
        'Employers submit opportunities, the university approves them, students apply and faculty follow each application, all on one shared record.',
        {
          large: true,
          icon: 'layers',
          extra: h(
            'div',
            { class: 'hero-actions' },
            h('a', { class: 'btn btn-light', href: '#employer' }, 'Start the demo', icon('arrow', 16)),
            h('a', { class: 'btn btn-outline-light', href: '#student' }, 'Browse as a student'),
          ),
        },
      ),
      stats(
        [
          { key: 'pending', label: 'Pending review', value: counts.pending, note: 'Waiting for the administrator', icon: 'clock' },
          { key: 'approved', label: 'Approved opportunities', value: counts.approved, note: 'Visible to students', icon: 'checkCircle' },
          { key: 'applications', label: 'Applications', value: counts.applications, note: 'Submitted by students', icon: 'send' },
          { key: 'placement', label: 'Placement status', value: PLACEMENT_STATUS, text: true, note: 'Decisions are deferred', icon: 'lock' },
        ],
        'four',
      ),
      h('div', { class: 'section-head' }, h('h2', null, 'How the journey works')),
      h(
        'div',
        { class: 'how-grid' },
        steps.map((step, index) =>
          h(
            'a',
            { class: 'how-card', href: `#${step.role.id}` },
            h('div', { class: 'how-top' }, h('span', { class: 'how-step' }, `Step ${index + 1}`), h('span', { class: 'how-icon' }, icon(step.role.icon, 20))),
            h('h3', null, step.role.label),
            h('p', null, step.text),
            h('span', { class: 'how-metric' }, step.metric, icon('arrow', 16)),
          ),
        ),
      ),
      h('div', { class: 'overview-cols' }, journeyCard(true), activityCard(8)),
      h('div', { class: 'section-head' }, h('h2', null, 'What is working, simulated or deferred')),
      h(
        'div',
        { class: 'scope-cards' },
        scope('scope-working', 'checkCircle', 'Working', [
          'One shared record carried through all four roles with the same IDs',
          'Required-field checks, status changes, duplicate prevention',
          'Records persist across role changes and reloads in this browser',
        ]),
        scope('scope-simulated', 'info', 'Simulated', ['Role switching (no login)', 'HR authorization checkbox', 'A single student and faculty reviewer']),
        scope('scope-deferred', 'clock', 'Deferred', [
          'Real authentication and permissions',
          'Shared central storage',
          'Eligibility verification',
          'Review and placement decisions',
        ]),
      ),
    );
  }

  // ---------- tabs (Student and Employer HR) ----------

  /** A tab bar for the current route; `counts` maps a tab ID to a number shown beside its label. */
  function tabBar(tabs, label, counts) {
    return h(
      'div',
      { class: 'tabs', role: 'tablist', 'aria-label': label },
      tabs.map((tab) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            id: `tab-${tab.id}`,
            'aria-controls': `panel-${tab.id}`,
            'aria-selected': String(ui.tab === tab.id),
            tabindex: ui.tab === tab.id ? '0' : '-1',
            onClick: () => setTab(tab.id),
            onKeydown: onTabKeys,
          },
          icon(tab.icon, 16),
          tab.label,
          counts[tab.id] !== undefined && h('span', { class: 'tab-count' }, counts[tab.id]),
        ),
      ),
    );
  }

  function tabPanel(id, content) {
    return h('div', { role: 'tabpanel', id: `panel-${id}`, 'aria-labelledby': `tab-${id}`, hidden: ui.tab !== id }, content);
  }

  // ---------- Student view ----------

  function studentView() {
    const student = store.getStudent(STUDENT_ID);
    const counts = store.counts();
    const mine = store.listStudentApplications(STUDENT_ID);

    const tablist = tabBar(STUDENT_TABS, 'Student sections', { applications: mine.length });
    const panel = tabPanel;

    return h(
      'div',
      null,
      hero('Student view', `Welcome, ${student.display_name}`, 'Browse approved internships and apply. Applying expresses interest; it does not approve a placement.', { icon: 'cap' }),
      stats([
        { key: 'approved', label: 'Open opportunities', value: counts.approved, note: 'Approved by the university', icon: 'checkCircle' },
        { key: 'applications', label: 'My applications', value: mine.length, note: 'Submitted by you', icon: 'send' },
        { key: 'placement', label: 'Placement status', value: PLACEMENT_STATUS, text: true, note: 'Decided separately from applying', icon: 'lock' },
      ]),
      tablist,
      panel('opportunities', opportunitiesPanel()),
      panel('applications', applicationsPanel(mine)),
      panel('profile', profilePanel(student)),
    );
  }

  function setTab(id, moveFocus) {
    ui.tab = id;
    document.querySelectorAll('#view [role="tab"]').forEach((button) => {
      const selected = button.id === `tab-${id}`;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && moveFocus) button.focus();
    });
    document.querySelectorAll('#view [role="tabpanel"]').forEach((panelEl) => {
      panelEl.hidden = panelEl.id !== `panel-${id}`;
    });
    try {
      history.replaceState(null, '', `#${ui.route}/${id}`);
    } catch (error) {
      /* some embedders block history updates; the tab still works */
    }
  }

  function onTabKeys(event) {
    const ids = (ROLE_TABS[ui.route] || []).map((tab) => tab.id);
    const index = ids.indexOf(ui.tab);
    let next = null;
    if (event.key === 'ArrowRight') next = (index + 1) % ids.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + ids.length) % ids.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ids.length - 1;
    if (next !== null) {
      event.preventDefault();
      setTab(ids[next], true);
    }
  }

  function opportunitiesPanel() {
    const search = h('input', {
      id: 'search',
      type: 'search',
      value: ui.query,
      placeholder: 'e.g. Design, Northstar',
      autocomplete: 'off',
      onInput: (event) => {
        ui.query = event.target.value;
        fillResults();
      },
    });
    const modes = ['All', ...WORK_MODES];
    return [
      h(
        'div',
        { class: 'filters' },
        h('div', { class: 'field search' }, h('label', { for: 'search' }, 'Search by title or organization'), h('div', { class: 'search-box' }, icon('search', 18), search)),
        h(
          'fieldset',
          null,
          h('legend', null, 'Work mode'),
          h(
            'div',
            { class: 'segmented' },
            modes.map((mode) =>
              h(
                'label',
                { class: 'seg' },
                h('input', {
                  type: 'radio',
                  name: 'workmode',
                  value: mode,
                  checked: ui.workMode === mode,
                  onChange: () => {
                    ui.workMode = mode;
                    fillResults();
                  },
                }),
                h('span', null, mode),
              ),
            ),
          ),
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'sort' }, 'Sort by'),
          h(
            'select',
            {
              id: 'sort',
              onChange: (event) => {
                ui.sort = event.target.value;
                fillResults();
              },
            },
            [
              ['newest', 'Newest first'],
              ['title', 'Title A–Z'],
            ].map(([value, label]) => h('option', { value, selected: ui.sort === value }, label)),
          ),
        ),
      ),
      h('p', { id: 'result-count', class: 'muted', 'aria-live': 'polite' }),
      h('div', { id: 'results' }),
    ];
  }

  // Called after the panel is attached, and whenever a filter changes.
  function fillResults() {
    const results = $('#results');
    if (!results) return;
    const list = store.searchApproved(ui.query, { workMode: ui.workMode, sort: ui.sort });
    const query = ui.query.trim();
    const filtered = Boolean(query) || ui.workMode !== 'All';
    $('#result-count').textContent = `${list.length} approved ${list.length === 1 ? 'opportunity' : 'opportunities'}${
      query ? ` matching “${query}”` : ''
    }${ui.workMode !== 'All' ? ` · ${ui.workMode}` : ''}`;
    if (list.length === 0) {
      results.replaceChildren(
        emptyState(
          'search',
          'No matching opportunities',
          filtered
            ? `No approved opportunities match ${query ? `“${query}”` : 'these filters'}. Try a different title or organization, or clear the filters.`
            : 'No approved opportunities are available yet. They appear here after university review.',
          filtered &&
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-quiet',
                onClick: () => {
                  ui.query = '';
                  ui.workMode = 'All';
                  ui.focusId = 'search';
                  render();
                },
              },
              'Clear filters',
            ),
        ),
      );
      return;
    }
    results.replaceChildren(h('div', { class: 'grid-2' }, list.map(opportunityCard)));
  }

  function opportunityCard(opportunity) {
    const id = opportunity.opportunity_id;
    const applied = store.getApplicationFor(STUDENT_ID, id);
    const isDemo = opportunity.origin === 'demo';
    return h(
      'article',
      { class: `card opp${ui.fresh.has(id) ? ' is-new' : ''}`, 'aria-labelledby': `opp-title-${id}` },
      h(
        'div',
        { class: 'opp-head' },
        orgTile(opportunity.organization_name),
        h('div', { class: 'opp-head-text' }, h('p', { class: 'org' }, opportunity.organization_name), h('h3', { id: `opp-title-${id}` }, opportunity.title)),
        isDemo ? chip('New', 'new') : h('span', { class: 'idtag' }, id),
      ),
      h('p', { class: 'desc' }, opportunity.description),
      metaChips(opportunity),
      h(
        'div',
        { class: 'opp-foot' },
        applied
          ? h('p', { class: 'applied', id: `applied-${id}`, tabindex: '-1' }, chip('Application submitted', 'submitted', 'check'), applied.application_id)
          : h(
              'button',
              { type: 'button', class: 'btn', onClick: (event) => openApplyDialog(opportunity, event.currentTarget) },
              icon('send', 16),
              'Apply',
              h('span', { class: 'sr-only' }, ` to ${opportunity.title} at ${opportunity.organization_name}`),
            ),
        isDemo && h('span', { class: 'idtag' }, id),
      ),
    );
  }

  function applicationsPanel(mine) {
    if (mine.length === 0) {
      return emptyState(
        'inbox',
        'No applications yet',
        'Apply to an approved opportunity and it will be tracked here.',
        h('button', { type: 'button', class: 'btn', onClick: () => setTab('opportunities', true) }, 'Browse opportunities'),
      );
    }
    return [
      h('p', { class: 'notice' }, icon('info', 18), 'Application status and placement status are separate. Submitting an application does not approve a placement.'),
      h(
        'div',
        { class: 'grid-2' },
        mine
          .slice()
          .reverse()
          .map((application) =>
            h(
              'article',
              { class: `card${ui.fresh.has(application.opportunity_id) ? ' is-new' : ''}` },
              h(
                'div',
                { class: 'opp-head' },
                orgTile(application.opportunity.organization_name),
                h('div', { class: 'opp-head-text' }, h('h3', null, application.opportunity.title), h('p', { class: 'muted' }, application.opportunity.organization_name)),
                chip(application.application_status, 'submitted'),
              ),
              facts([
                ['Application ID', application.application_id],
                ['Opportunity ID', application.opportunity_id],
                ['Application status', application.application_status],
                ['Placement status', chip(application.placement_status, 'neutral')],
                ['Submitted', formatTime(application.submitted_at)],
              ]),
              h(
                'ol',
                { class: 'lifecycle', 'aria-label': 'Application progress' },
                h('li', { class: 'life-step is-done' }, h('strong', null, 'Submitted'), timeEl(application.submitted_at)),
                h('li', { class: 'life-step' }, h('strong', null, 'Faculty review'), application.review ? application.review.review_status : 'Not started'),
                h('li', { class: 'life-step' }, h('strong', null, 'Placement'), application.placement_status),
              ),
            ),
          ),
      ),
    ];
  }

  function profilePanel(student) {
    const value = ui.nameDraft !== null ? ui.nameDraft : student.display_name;
    return h(
      'form',
      { class: 'card form', novalidate: true, onSubmit: onProfileSubmit },
      h(
        'div',
        { class: 'profile-head' },
        avatar(student.display_name, 'lg'),
        h('div', null, h('h2', null, 'My demo profile'), h('p', { class: 'muted' }, `${student.student_id} · Student`)),
      ),
      field({
        id: 'profile-display-name',
        name: 'display_name',
        label: 'Display name',
        value,
        error: ui.nameError,
        required: true,
        maxlength: LIMITS.display_name,
      }),
      facts([
        ['Student ID', student.student_id],
        ['Eligibility', chip(student.eligibility_status, 'approved', 'check')],
      ]),
      h('p', { class: 'note' }, 'Eligibility verification is deferred. This status is seeded demo data and is not checked against university records.'),
      h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn' }, 'Save profile')),
    );
  }

  function onProfileSubmit(event) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('display_name');
    const result = act(() => store.updateDisplayName(STUDENT_ID, value));
    ui.focusId = 'profile-display-name';
    if (!result.ok) {
      ui.nameDraft = String(value);
      ui.nameError = result.errors ? result.errors.display_name : result.message;
      render();
      return;
    }
    ui.nameDraft = null;
    ui.nameError = '';
    showToast(`Display name saved as “${result.student.display_name}”.`);
    render();
  }

  // ---------- apply dialog ----------

  function openApplyDialog(opportunity) {
    ui.pendingApply = opportunity.opportunity_id;
    const student = store.getStudent(STUDENT_ID);
    $('#apply-facts').replaceChildren(
      ...[
        ['Opportunity', `${opportunity.title} (${opportunity.opportunity_id})`],
        ['Organization', opportunity.organization_name],
        ['Applicant', `${student.display_name} (${student.student_id})`],
      ].map(([label, value]) => h('div', null, h('dt', null, label), h('dd', null, value))),
    );
    const error = $('#apply-error');
    error.hidden = true;
    error.textContent = '';
    $('#apply-dialog').showModal();
  }

  function confirmApply() {
    const opportunityId = ui.pendingApply;
    const result = act(() => store.submitApplication(STUDENT_ID, opportunityId));
    if (!result.ok) {
      const error = $('#apply-error');
      error.textContent = result.message;
      error.hidden = false;
      render();
      return;
    }
    ui.pendingApply = null;
    ui.dialogFocusId = `applied-${opportunityId}`;
    ui.fresh = new Set([opportunityId, result.application.application_id]);
    $('#apply-dialog').close();
    const opportunity = store.listOpportunities().find((item) => item.opportunity_id === opportunityId);
    showToast(
      `${result.application.application_id} submitted for ${opportunity.title} at ${opportunity.organization_name}. Application status: Submitted. Placement status: ${PLACEMENT_STATUS}. Employer HR and Faculty Reviewer can now view it.`,
      { link: { href: '#employer/applicants', text: 'Next: see it as Employer HR' } },
    );
    render();
  }

  // ---------- Employer HR view ----------

  function previewCard() {
    const draft = ui.draft;
    const org = draft.organization_name.trim();
    const title = draft.title.trim();
    const description = draft.description.trim();
    return h(
      'article',
      { class: 'card opp preview', 'aria-label': 'Listing preview' },
      h(
        'div',
        { class: 'opp-head' },
        orgTile(org || '?'),
        h(
          'div',
          { class: 'opp-head-text' },
          h('p', { class: `org${org ? '' : ' placeholder'}` }, org || 'Organization name'),
          h('h3', { class: title ? null : 'placeholder' }, title || 'Opportunity title'),
        ),
      ),
      h('p', { class: `desc${description ? '' : ' placeholder'}` }, description || 'The description students will read appears here.'),
      metaChips({
        location: draft.location.trim() || 'Location',
        work_mode: draft.work_mode,
        duration: draft.duration.trim() || 'Duration',
      }),
      h('div', { class: 'opp-foot' }, chip('Pending Review', 'pending', 'clock'), h('span', { class: 'muted' }, 'Students see it after approval')),
    );
  }

  function employerView() {
    const opportunities = store.listOpportunities().reverse(); // newest first
    const received = store.listEmployerApplications();
    const applicantCounts = store.applicantCounts();
    const hasErrors = Object.keys(ui.errors).length > 0;

    const form = h(
      'form',
      { id: 'opp-form', class: 'card form form-card', novalidate: true, onSubmit: onEmployerSubmit, onInput: onEmployerInput },
      h('h2', { class: 'card-title' }, icon('briefcase', 18), 'Submit an opportunity'),
      h(
        'div',
        { class: 'authz' },
        h(
          'label',
          { class: 'check' },
          h('input', { type: 'checkbox', id: 'hr-authorized', checked: ui.hrAuthorized, onChange: onAuthChange }),
          'Simulate an authorized HR representative',
        ),
        h('p', { class: 'hint' }, 'Demo-only control, not production access control. Real HR authorization is deferred. Untick it to see submission blocked.'),
      ),
      h('p', { class: 'hint' }, 'Fields marked * are required.'),
      (ui.formMessage || hasErrors) &&
        h('div', { id: 'opp-form-error', class: 'error-summary', role: 'alert', tabindex: '-1' }, ui.formMessage || 'Fix the highlighted fields and submit again.'),
      field({ id: 'opp-organization_name', name: 'organization_name', label: 'Organization name', value: ui.draft.organization_name, error: ui.errors.organization_name, required: true, maxlength: LIMITS.organization_name }),
      field({ id: 'opp-title', name: 'title', label: 'Opportunity title', value: ui.draft.title, error: ui.errors.title, required: true, maxlength: LIMITS.title }),
      field({ id: 'opp-description', name: 'description', label: 'Description', value: ui.draft.description, error: ui.errors.description, required: true, multiline: true, maxlength: LIMITS.description, counter: true }),
      h(
        'div',
        { class: 'two-col' },
        field({ id: 'opp-location', name: 'location', label: 'Location', value: ui.draft.location, error: ui.errors.location, required: true, maxlength: LIMITS.location }),
        field({ id: 'opp-work_mode', name: 'work_mode', label: 'Work mode', value: ui.draft.work_mode, options: WORK_MODES }),
      ),
      field({ id: 'opp-duration', name: 'duration', label: 'Duration (optional)', value: ui.draft.duration, error: ui.errors.duration, hint: 'For example: 12 weeks', maxlength: LIMITS.duration }),
      h('p', { id: 'authz-blocked', class: 'blocked', hidden: ui.hrAuthorized }, icon('lock', 16), 'Submission is blocked: the simulated HR authorization is unchecked.'),
      h(
        'div',
        { class: 'form-actions' },
        h('button', { type: 'submit', id: 'submit-opp', class: 'btn', disabled: !ui.hrAuthorized, 'aria-describedby': 'authz-blocked' }, icon('send', 16), 'Submit for review'),
        h('button', { type: 'button', class: 'btn btn-quiet', onClick: fillSample }, 'Fill sample data'),
      ),
    );

    const preview = h(
      'section',
      { class: 'stack preview-sec', 'aria-labelledby': 'preview-title' },
      h('div', { class: 'section-head' }, h('h2', { id: 'preview-title', class: 'card-title' }, icon('eye', 18), 'Live preview')),
      h('p', { class: 'muted' }, 'How students will see this listing once an administrator approves it. It updates as you type.'),
      h('div', { id: 'preview-slot' }, previewCard()),
    );

    const statusCard = h(
      'section',
      { class: 'card stack status-card', 'aria-labelledby': 'status-heading' },
      h('h2', { id: 'status-heading', class: 'card-title', tabindex: '-1' }, icon('pulse', 18), 'Opportunity status'),
      h('p', { class: 'muted' }, 'Status is read from the shared opportunity record, so the administrator’s decision shows up here.'),
      h(
        'ul',
        { class: 'status-list' },
        opportunities.map((opportunity) =>
          h(
            'li',
            { class: `status-row${ui.fresh.has(opportunity.opportunity_id) ? ' is-new' : ''}` },
            orgTile(opportunity.organization_name, 'sm'),
            h(
              'div',
              { class: 'body' },
              h('div', { class: 'row-head' }, h('p', { class: 'row-title' }, opportunity.title), approvalChip(opportunity.approval_status)),
              h('p', { class: 'muted' }, `${opportunity.organization_name} · ${opportunity.opportunity_id}${opportunity.origin === 'demo' ? ' · submitted in this demo' : ''}`),
              h(
                'p',
                { class: 'muted' },
                opportunity.approval_status === OPPORTUNITY_STATUS.PENDING
                  ? 'Waiting for university approval. Students cannot see it yet.'
                  : 'Approved. Visible to students.',
              ),
              applicantCounts[opportunity.opportunity_id] > 0 &&
                h(
                  'button',
                  { type: 'button', class: 'link-btn', onClick: () => setTab('applicants', true) },
                  `${applicantCounts[opportunity.opportunity_id]} ${applicantCounts[opportunity.opportunity_id] === 1 ? 'applicant' : 'applicants'} · View`,
                ),
            ),
          ),
        ),
      ),
    );

    return h(
      'div',
      null,
      hero('Employer HR view', 'Employer HR', 'Submit an internship opportunity for university review, then see who applies. New submissions start as Pending Review.', { icon: 'briefcase' }),
      tabBar(EMPLOYER_TABS, 'Employer sections', { applicants: received.length }),
      tabPanel('submit', h('div', { class: 'split' }, form, h('div', { class: 'side' }, preview, statusCard))),
      tabPanel('applicants', applicantsPanel(received)),
    );
  }

  /** Applications received by Employer HR: read-only, and never an implication of a placement. */
  function applicantsPanel(received) {
    const notice = h(
      'p',
      { class: 'notice' },
      icon('info', 18),
      'View only. An application is not a placement: shortlisting, interviews and offers are deferred. In this demo the simulated HR user sees applicants for every organization; per-employer access needs real accounts.',
    );
    if (received.length === 0) {
      return [
        notice,
        emptyState(
          'inbox',
          'No applications yet',
          'When a student applies to an approved opportunity, the applicant appears here.',
          h('a', { class: 'btn', href: '#student' }, 'Open the Student view', icon('arrow', 16)),
        ),
      ];
    }
    return [
      notice,
      h('div', { class: 'section-head' }, h('h2', { id: 'applicants-heading', tabindex: '-1' }, `Applications received (${received.length})`)),
      h(
        'div',
        { class: 'grid-2' },
        received.map((entry) =>
          h(
            'article',
            { class: `card${ui.fresh.has(entry.application.application_id) ? ' is-new' : ''}` },
            h(
              'div',
              { class: 'opp-head' },
              avatar(entry.student.display_name),
              h(
                'div',
                { class: 'opp-head-text' },
                h('h3', null, entry.student.display_name),
                h('p', { class: 'muted' }, `Applied to ${entry.opportunity.title} · ${entry.opportunity.organization_name}`),
              ),
              chip(entry.application.application_status, 'submitted'),
            ),
            facts([
              ['Application ID', entry.application.application_id],
              ['Student ID', entry.student.student_id],
              ['Opportunity ID', entry.opportunity.opportunity_id],
              ['Eligibility', chip(entry.student.eligibility_status, 'approved', 'check')],
              ['Application status', entry.application.application_status],
              ['Placement status', chip(entry.placement_status, 'neutral')],
              ['Submitted', h('span', null, formatTime(entry.application.submitted_at), ' (', timeEl(entry.application.submitted_at), ')')],
            ]),
          ),
        ),
      ),
    ];
  }

  function onEmployerInput(event) {
    const name = event.target.name;
    if (!name || !(name in ui.draft)) return;
    ui.draft[name] = event.target.value;
    const slot = $('#preview-slot');
    if (slot) slot.replaceChildren(previewCard());
    if (name === 'description') {
      const counter = $('#opp-description-count');
      if (counter) counter.textContent = `${event.target.value.length} / ${LIMITS.description}`;
    }
  }

  function onAuthChange(event) {
    ui.hrAuthorized = event.target.checked;
    $('#submit-opp').disabled = !ui.hrAuthorized;
    $('#authz-blocked').hidden = ui.hrAuthorized;
  }

  function fillSample() {
    ui.draft = { ...SAMPLE_DRAFTS[ui.sampleIndex % SAMPLE_DRAFTS.length] };
    ui.sampleIndex += 1;
    ui.errors = {};
    ui.formMessage = '';
    ui.focusId = ui.hrAuthorized ? 'submit-opp' : 'hr-authorized';
    render();
  }

  function onEmployerSubmit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    ui.draft = { ...blankDraft(), ...data };
    const result = act(() => store.submitOpportunity(data, { hrAuthorized: ui.hrAuthorized }));
    if (!result.ok) {
      ui.errors = result.errors || {};
      ui.formMessage = result.message;
      const firstInvalid = ['organization_name', 'title', 'description', 'location', 'duration'].find((name) => ui.errors[name]);
      ui.focusId = firstInvalid ? `opp-${firstInvalid}` : 'opp-form-error';
      render();
      return;
    }
    const created = result.opportunity;
    ui.draft = blankDraft();
    ui.errors = {};
    ui.formMessage = '';
    ui.focusId = 'status-heading';
    ui.fresh = new Set([created.opportunity_id]);
    showToast(`${created.opportunity_id} “${created.title}” submitted. Status: ${created.approval_status}.`, {
      link: { href: '#admin', text: 'Next: review it as University Administrator' },
    });
    render();
  }

  // ---------- University Administrator view ----------

  function adminView() {
    const pending = store.listOpportunities({ status: OPPORTUNITY_STATUS.PENDING });
    const approved = store.listOpportunities({ status: OPPORTUNITY_STATUS.APPROVED });

    const head = (opportunity) =>
      h(
        'div',
        { class: 'opp-head' },
        orgTile(opportunity.organization_name),
        h('div', { class: 'opp-head-text' }, h('p', { class: 'org' }, opportunity.organization_name), h('h3', null, opportunity.title)),
        h('span', { class: 'idtag' }, opportunity.opportunity_id),
      );

    const queue = pending.length
      ? h(
          'div',
          { class: 'grid-2' },
          pending.map((opportunity) =>
            h(
              'article',
              { class: 'card opp' },
              head(opportunity),
              h('p', { class: 'desc' }, opportunity.description),
              metaChips(opportunity),
              h(
                'div',
                { class: 'opp-foot' },
                approvalChip(opportunity.approval_status),
                h(
                  'button',
                  { type: 'button', class: 'btn', onClick: () => approve(opportunity) },
                  icon('check', 16),
                  'Approve',
                  h('span', { class: 'sr-only' }, ` ${opportunity.title} (${opportunity.opportunity_id})`),
                ),
              ),
            ),
          ),
        )
      : emptyState('inbox', 'The review queue is empty', 'No opportunities are waiting for review. Submissions from the Employer HR view appear here as Pending Review.');

    const approvedList = approved.length
      ? h(
          'div',
          { class: 'grid-2' },
          approved
            .slice()
            .reverse()
            .map((opportunity) =>
              h(
                'article',
                { class: `card opp${ui.fresh.has(opportunity.opportunity_id) ? ' is-new' : ''}` },
                head(opportunity),
                metaChips(opportunity),
                h('div', { class: 'opp-foot' }, approvalChip(opportunity.approval_status)),
              ),
            ),
        )
      : emptyState('checkCircle', 'Nothing approved yet', 'Approved opportunities are listed here once published to students.');

    return h(
      'div',
      null,
      hero('University Administrator view', 'University Administrator', 'Review submitted opportunities and approve them for students. Rejection and return for revision are deferred.', { icon: 'shield' }),
      stats(
        [
          { key: 'pending', label: 'Pending review', value: pending.length, note: 'Waiting for your decision', icon: 'clock' },
          { key: 'approved', label: 'Approved', value: approved.length, note: 'Visible to students', icon: 'checkCircle' },
        ],
        'two',
      ),
      h('div', { class: 'section-head' }, h('h2', { id: 'queue-heading', tabindex: '-1' }, 'Review queue')),
      queue,
      h('div', { class: 'section-head' }, h('h2', null, 'Approved opportunities')),
      approvedList,
    );
  }

  function approve(opportunity) {
    ui.focusId = 'queue-heading';
    ui.fresh = new Set([opportunity.opportunity_id]);
    const result = act(() => store.approveOpportunity(opportunity.opportunity_id));
    if (!result.ok) {
      ui.fresh = new Set();
      showToast(result.message, { error: true });
      render();
      return;
    }
    showToast(`${opportunity.opportunity_id} “${opportunity.title}” approved. Students can now see it, and Employer HR sees the new status.`, {
      link: { href: '#student', text: 'Next: apply as Student' },
    });
    render();
  }

  // ---------- Faculty Reviewer view ----------

  function facultyView() {
    const records = store.listFacultyRecords();
    const body = records.length
      ? h(
          'div',
          { class: 'grid-2' },
          records
            .slice()
            .reverse()
            .map((record) =>
              h(
                'article',
                { class: `card${ui.fresh.has(record.application.application_id) ? ' is-new' : ''}` },
                h(
                  'div',
                  { class: 'opp-head' },
                  avatar(record.student.display_name),
                  h('div', { class: 'opp-head-text' }, h('h3', null, record.student.display_name), h('p', { class: 'muted' }, `${record.opportunity.title} · ${record.opportunity.organization_name}`)),
                  chip(record.application.application_status, 'submitted'),
                ),
                facts([
                  ['Application ID', record.application.application_id],
                  ['Student ID', record.student.student_id],
                  ['Opportunity ID', record.opportunity.opportunity_id],
                  ['Review ID', record.review.review_id],
                  ['Review status', chip(record.review.review_status, 'neutral')],
                  ['Application status', record.application.application_status],
                  ['Placement status', chip(record.placement_status, 'neutral')],
                  ['Submitted', formatTime(record.application.submitted_at)],
                ]),
              ),
            ),
        )
      : emptyState('book', 'No applications yet', 'Applications submitted in the Student view appear here, linked to the same student and opportunity IDs.');

    return h(
      'div',
      null,
      hero('Faculty Reviewer view', 'Faculty Reviewer', 'Inspect student application records and their statuses.', { icon: 'book', extra: chip('Read-only', 'neutral', 'lock') }),
      h('p', { class: 'notice' }, icon('info', 18), 'Read-only view. Viewing an application does not approve a placement. Review decisions and placement approval are deferred.'),
      h('div', { class: 'section-head' }, h('h2', null, `Application records (${records.length})`)),
      body,
    );
  }

  // ---------- chrome: navigation, top bar, render loop ----------

  const VIEWS = { overview: overviewView, student: studentView, employer: employerView, admin: adminView, faculty: facultyView };

  function persona(routeId) {
    switch (routeId) {
      case 'employer':
        return { name: 'HR Representative', detail: 'Sample employer user' };
      case 'admin':
        return { name: 'Placement Office', detail: 'Sample administrator' };
      case 'student': {
        const student = store.getStudent(STUDENT_ID);
        return { name: student.display_name, detail: `${student.student_id} · Student` };
      }
      case 'faculty': {
        const faculty = store.getFaculty();
        return { name: faculty.display_name, detail: `${faculty.faculty_id} · Faculty` };
      }
      default:
        return { name: 'Demo overview', detail: 'Choose a role to begin' };
    }
  }

  function renderTopbar() {
    const current = ROUTES.find((item) => item.id === ui.route);
    $('#crumb-current').textContent = current.label;
    const who = persona(ui.route);
    $('#persona').replaceChildren(
      ui.route === 'overview' ? h('span', { class: 'avatar tone-0', 'aria-hidden': 'true' }, icon('layers', 16)) : avatar(who.name),
      h('span', { class: 'persona-text' }, h('span', { class: 'persona-name' }, who.name), h('span', { class: 'persona-detail' }, who.detail)),
      h('span', { class: 'sim-tag', title: 'There is no real sign-in; roles are switched from the sidebar.' }, ui.route === 'overview' ? 'Demo' : 'Simulated'),
    );
  }

  function render(options) {
    const view = $('#view');
    view.classList.remove('view-enter');
    view.replaceChildren(VIEWS[ui.route]());
    if (ui.enter) {
      void view.offsetWidth; // restart the entrance animation
      view.classList.add('view-enter');
      ui.enter = false;
    }
    $('#workspace').classList.toggle('no-rail', ui.route === 'overview');
    $('#rail').replaceChildren(...(ui.route === 'overview' ? [] : [journeyCard(false), activityCard(6)]));
    renderTopbar();
    if (ui.route === 'student') fillResults();
    $('#storage-warning').hidden = store.isPersistent();
    ui.fresh = new Set();
    ui.activityPrimed = true;
    if (ui.focusId) {
      const target = document.getElementById(ui.focusId);
      if (target) target.focus();
      ui.focusId = null;
    } else if (options && options.focusHeading) {
      const heading = $('#page-title');
      if (heading) heading.focus();
    }
  }

  function buildNav() {
    const link = (item) =>
      h(
        'a',
        { href: `#${item.id}`, class: 'nav-item', 'data-route': item.id },
        h('span', { class: 'nav-icon' }, icon(item.icon, 20)),
        h(
          'span',
          { class: 'nav-text' },
          h('span', { class: 'nav-label' }, h('span', { class: 'nav-full' }, item.label), h('span', { class: 'nav-short' }, item.short)),
          h('span', { class: 'nav-hint' }, item.hint),
        ),
      );
    $('#role-nav').replaceChildren(link(OVERVIEW), h('p', { class: 'nav-group' }, 'Demo roles'), ...ROLES.map(link));
  }

  function updateNav() {
    document.querySelectorAll('#role-nav a').forEach((anchor) => {
      if (anchor.dataset.route === ui.route) anchor.setAttribute('aria-current', 'page');
      else anchor.removeAttribute('aria-current');
    });
    const current = ROUTES.find((item) => item.id === ui.route);
    document.title = `${current.label} · IPP walking skeleton demo`;
  }

  function route(initial) {
    const [routeId, tabId] = location.hash.replace(/^#\/?/, '').split('/');
    const next = ROUTES.some((item) => item.id === routeId) ? routeId : DEFAULT_ROUTE;
    const changed = next !== ui.route;
    ui.route = next;
    const tabs = ROLE_TABS[next];
    ui.tab = tabs ? (tabs.some((tab) => tab.id === tabId) ? tabId : tabs[0].id) : null;
    updateNav();
    if (changed || initial) {
      if (changed) clearToast();
      ui.enter = true;
      render({ focusHeading: !initial });
      if (changed && !initial) window.scrollTo(0, 0);
    } else if (tabs) {
      setTab(ui.tab);
    }
  }

  // ---------- reset + dialogs ----------

  function wireDialogs() {
    const applyDialog = $('#apply-dialog');
    const resetDialog = $('#reset-dialog');

    $('#apply-cancel').addEventListener('click', () => applyDialog.close());
    $('#apply-confirm').addEventListener('click', confirmApply);
    $('#reset-btn').addEventListener('click', () => resetDialog.showModal());
    $('#reset-cancel').addEventListener('click', () => resetDialog.close());
    $('#reset-confirm').addEventListener('click', () => {
      ui.draft = blankDraft();
      ui.errors = {};
      ui.formMessage = '';
      ui.query = '';
      ui.workMode = 'All';
      ui.sort = 'newest';
      ui.nameDraft = null;
      ui.nameError = '';
      ui.hrAuthorized = true;
      ui.sampleIndex = 0;
      ui.seenActivity.clear();
      ui.dialogFocusId = 'page-title';
      resetDialog.close();
      act(() => store.reset());
      showToast('Demo data reset to the initial synthetic records.');
      render();
    });

    // Focus is handled after close so the browser's own focus restoration cannot override it.
    for (const dialog of [applyDialog, resetDialog]) {
      dialog.addEventListener('close', () => {
        if (!ui.dialogFocusId) return;
        const target = document.getElementById(ui.dialogFocusId);
        ui.dialogFocusId = null;
        if (target) target.focus();
      });
    }
  }

  function init() {
    buildNav();
    wireDialogs();
    store.subscribe(() => {
      if (!ui.batch) render();
    });
    window.addEventListener('hashchange', () => route(false));
    window.addEventListener('storage', (event) => {
      if (event.key === null || event.key === Store.STORAGE_KEY) store.refresh();
    });
    setInterval(() => refreshRelativeTimes(), 15000);
    route(true);
  }

  init();
})();
