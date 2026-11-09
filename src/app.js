/*
 * IPP demo UI: four simulated role views over one shared, browser-local store.
 * Every user-supplied string is rendered with textContent (never innerHTML).
 */
(function () {
  'use strict';

  const Store = window.IPPStore;
  const store = Store.createStore(Store.browserStorage());
  const { OPPORTUNITY_STATUS, PLACEMENT_STATUS, WORK_MODES, LIMITS } = Store;

  const STUDENT_ID = 'STU-001'; // simulated sign-in: the demo always acts as this student

  // Ordered by the end-to-end journey. The demo still opens on the Student view.
  const ROLES = [
    { id: 'employer', label: 'Employer HR', hint: '1 · Submit opportunities' },
    { id: 'admin', label: 'University Administrator', hint: '2 · Review and approve' },
    { id: 'student', label: 'Student', hint: '3 · Browse and apply' },
    { id: 'faculty', label: 'Faculty Reviewer', hint: '4 · View applications' },
  ];
  const STUDENT_TABS = [
    { id: 'opportunities', label: 'Opportunities' },
    { id: 'applications', label: 'My applications' },
    { id: 'profile', label: 'My profile' },
  ];

  const SAMPLE_DRAFT = {
    organization_name: 'Harbor Robotics',
    title: 'Controls Engineering Intern',
    description: 'Help test motion-control firmware on a lab rig and document the results for the engineering team.',
    location: 'Abu Dhabi',
    work_mode: 'On-site',
    duration: '8 weeks',
  };
  const blankDraft = () => ({
    organization_name: '',
    title: '',
    description: '',
    location: '',
    work_mode: 'Hybrid',
    duration: '',
  });

  const ui = {
    role: 'student',
    tab: 'opportunities',
    query: '',
    hrAuthorized: true,
    draft: blankDraft(),
    errors: {},
    formMessage: '',
    nameDraft: null,
    nameError: '',
    focusId: null, // element to focus after the next render
    dialogFocusId: null, // element to focus once a dialog has closed
    pendingApply: null,
  };

  // ---------- tiny DOM helpers ----------

  const $ = (selector) => document.querySelector(selector);

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, value);
    }
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false) continue;
      el.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  function chip(text, kind) {
    return h('span', { class: `chip chip-${kind}` }, text);
  }
  const approvalChip = (status) => chip(status, status === OPPORTUNITY_STATUS.APPROVED ? 'approved' : 'pending');

  function facts(pairs) {
    return h('dl', { class: 'facts' }, pairs.map(([label, value]) => h('div', null, h('dt', null, label), h('dd', null, value))));
  }

  function formatTime(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function emptyState(title, text, action) {
    return h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, title), h('p', null, text), action);
  }

  function hero(roleLabel, title, text, extra) {
    return h(
      'section',
      { class: 'hero' },
      h('p', { class: 'eyebrow' }, `${roleLabel} view`),
      h('h1', { id: 'page-title', tabindex: '-1' }, title),
      h('p', null, text),
      extra,
    );
  }

  function stats(items, two) {
    return h(
      'div',
      { class: `stats${two ? ' two' : ''}` },
      items.map((item) =>
        h(
          'div',
          { class: 'stat' },
          h('p', { class: 'stat-label' }, item.label),
          h('p', { class: `stat-value${item.text ? ' text' : ''}` }, item.value),
          h('p', { class: 'stat-note' }, item.note),
        ),
      ),
    );
  }

  // ---------- toast (persistent live region) ----------

  function showToast(message, options) {
    const opts = options || {};
    const card = h(
      'div',
      { class: `toast-card${opts.error ? ' is-error' : ''}` },
      h('p', null, message),
      opts.link && h('a', { href: opts.link.href }, opts.link.text),
      h('button', { type: 'button', class: 'toast-close', 'aria-label': 'Dismiss notification', onClick: clearToast }, '×'),
    );
    $('#toast').replaceChildren(card);
  }
  function clearToast() {
    $('#toast').replaceChildren();
  }

  // ---------- form field builder ----------

  function field(spec) {
    const { id, name, label, value, error, hint, required, multiline, options, maxlength } = spec;
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
      h('label', { for: id }, label, required && h('span', { class: 'req', 'aria-hidden': 'true' }, ' *')),
      control,
      hint && h('p', { id: `${id}-hint`, class: 'hint' }, hint),
      error && h('p', { id: `${id}-error`, class: 'error' }, error),
    );
  }

  // ---------- Student view ----------

  function studentView() {
    const student = store.getStudent(STUDENT_ID);
    const counts = store.counts();
    const mine = store.listStudentApplications(STUDENT_ID);

    const tablist = h(
      'div',
      { class: 'tabs', role: 'tablist', 'aria-label': 'Student sections' },
      STUDENT_TABS.map((tab) =>
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
          tab.id === 'applications' ? `${tab.label} (${mine.length})` : tab.label,
        ),
      ),
    );
    const panel = (id, content) =>
      h('div', { role: 'tabpanel', id: `panel-${id}`, 'aria-labelledby': `tab-${id}`, hidden: ui.tab !== id }, content);

    return h(
      'div',
      null,
      hero(
        'Student',
        `Welcome, ${student.display_name}`,
        'Browse approved internships and apply. Applying expresses interest; it does not approve a placement.',
      ),
      stats([
        { label: 'Open opportunities', value: counts.approved, note: 'Approved by the university' },
        { label: 'My applications', value: mine.length, note: 'Submitted by you' },
        { label: 'Placement status', value: PLACEMENT_STATUS, text: true, note: 'Decided separately from applying' },
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
    document.querySelectorAll('#view [role="tabpanel"]').forEach((panel) => {
      panel.hidden = panel.id !== `panel-${id}`;
    });
    try {
      history.replaceState(null, '', `#student/${id}`);
    } catch (error) {
      /* some embedders block history updates; the tab still works */
    }
  }

  function onTabKeys(event) {
    const ids = STUDENT_TABS.map((tab) => tab.id);
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
    return [
      h('div', { class: 'field' }, h('label', { for: 'search' }, 'Search by title or organization'), search),
      h('p', { id: 'result-count', class: 'muted', 'aria-live': 'polite' }),
      h('div', { id: 'results' }),
    ];
  }

  // Called after the panel is attached, and on every keystroke in the search box.
  function fillResults() {
    const results = $('#results');
    if (!results) return;
    const list = store.searchApproved(ui.query);
    const query = ui.query.trim();
    $('#result-count').textContent = `${list.length} approved ${list.length === 1 ? 'opportunity' : 'opportunities'}${
      query ? ` matching “${query}”` : ''
    }`;
    if (list.length === 0) {
      results.replaceChildren(
        emptyState(
          'No matching opportunities',
          query
            ? `No approved opportunities match “${query}”. Try a different title or organization.`
            : 'No approved opportunities are available yet. They appear here after university review.',
        ),
      );
      return;
    }
    results.replaceChildren(h('div', { class: 'grid-2' }, list.map(opportunityCard)));
  }

  function opportunityCard(opportunity) {
    const id = opportunity.opportunity_id;
    const applied = store.getApplicationFor(STUDENT_ID, id);
    return h(
      'article',
      { class: 'card opp', 'aria-labelledby': `opp-title-${id}` },
      h('div', { class: 'card-top' }, h('p', { class: 'org' }, opportunity.organization_name), h('span', { class: 'idtag' }, id)),
      h('h3', { id: `opp-title-${id}` }, opportunity.title),
      h('p', { class: 'desc' }, opportunity.description),
      h('ul', { class: 'meta' }, [opportunity.location, opportunity.work_mode, opportunity.duration].map((item) => h('li', null, item))),
      applied
        ? h('p', { class: 'applied', id: `applied-${id}`, tabindex: '-1' }, chip('Application submitted', 'submitted'), applied.application_id)
        : h(
            'button',
            { type: 'button', class: 'btn', onClick: (event) => openApplyDialog(opportunity, event.currentTarget) },
            'Apply',
            h('span', { class: 'sr-only' }, ` to ${opportunity.title} at ${opportunity.organization_name}`),
          ),
    );
  }

  function applicationsPanel(mine) {
    if (mine.length === 0) {
      return emptyState(
        'No applications yet',
        'Apply to an approved opportunity and it will be tracked here.',
        h('button', { type: 'button', class: 'btn', onClick: () => setTab('opportunities', true) }, 'Browse opportunities'),
      );
    }
    return [
      h('p', { class: 'notice' }, 'Application status and placement status are separate. Submitting an application does not approve a placement.'),
      h(
        'div',
        { class: 'grid-2' },
        mine
          .slice()
          .reverse()
          .map((application) =>
            h(
              'article',
              { class: 'card' },
              h('div', { class: 'card-top' }, h('h3', null, application.opportunity.title), chip(application.application_status, 'submitted')),
              h('p', { class: 'muted' }, application.opportunity.organization_name),
              facts([
                ['Application ID', application.application_id],
                ['Opportunity ID', application.opportunity_id],
                ['Application status', application.application_status],
                ['Placement status', chip(application.placement_status, 'neutral')],
                ['Submitted', formatTime(application.submitted_at)],
              ]),
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
      h('h2', null, 'My demo profile'),
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
        ['Eligibility', chip(student.eligibility_status, 'approved')],
      ]),
      h('p', { class: 'note' }, 'Eligibility verification is deferred. This status is seeded demo data and is not checked against university records.'),
      h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn' }, 'Save profile')),
    );
  }

  function onProfileSubmit(event) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('display_name');
    const result = store.updateDisplayName(STUDENT_ID, value);
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
    // The store already re-rendered inside updateDisplayName(), before the error state was cleared above.
    render();
  }

  // ---------- apply dialog ----------

  function openApplyDialog(opportunity, trigger) {
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
    const result = store.submitApplication(STUDENT_ID, opportunityId);
    if (!result.ok) {
      const error = $('#apply-error');
      error.textContent = result.message;
      error.hidden = false;
      return;
    }
    ui.pendingApply = null;
    ui.dialogFocusId = `applied-${opportunityId}`;
    $('#apply-dialog').close();
    const opportunity = store.listOpportunities().find((item) => item.opportunity_id === opportunityId);
    showToast(
      `${result.application.application_id} submitted for ${opportunity.title} at ${opportunity.organization_name}. Application status: Submitted. Placement status: ${PLACEMENT_STATUS}.`,
      { link: { href: '#faculty', text: 'Next: see it as Faculty Reviewer →' } },
    );
  }

  // ---------- Employer HR view ----------

  function employerView() {
    const opportunities = store.listOpportunities().reverse(); // newest first
    const hasErrors = Object.keys(ui.errors).length > 0;

    const form = h(
      'form',
      { id: 'opp-form', class: 'card form', novalidate: true, onSubmit: onEmployerSubmit, onInput: onEmployerInput },
      h('h2', null, 'Submit an opportunity'),
      h(
        'div',
        { class: 'authz' },
        h(
          'label',
          { class: 'check' },
          h('input', { type: 'checkbox', id: 'hr-authorized', checked: ui.hrAuthorized, onChange: onAuthChange }),
          'Simulate an authorized HR representative',
        ),
        h(
          'p',
          { class: 'hint' },
          'Demo-only control, not production access control. Real HR authorization is deferred. Untick it to see submission blocked.',
        ),
      ),
      h('p', { class: 'hint' }, 'Fields marked * are required.'),
      (ui.formMessage || hasErrors) &&
        h('div', { id: 'opp-form-error', class: 'error-summary', role: 'alert', tabindex: '-1' }, ui.formMessage || 'Fix the highlighted fields and submit again.'),
      field({ id: 'opp-organization_name', name: 'organization_name', label: 'Organization name', value: ui.draft.organization_name, error: ui.errors.organization_name, required: true, maxlength: LIMITS.organization_name }),
      field({ id: 'opp-title', name: 'title', label: 'Opportunity title', value: ui.draft.title, error: ui.errors.title, required: true, maxlength: LIMITS.title }),
      field({ id: 'opp-description', name: 'description', label: 'Description', value: ui.draft.description, error: ui.errors.description, required: true, multiline: true, maxlength: LIMITS.description }),
      h(
        'div',
        { class: 'two-col' },
        field({ id: 'opp-location', name: 'location', label: 'Location', value: ui.draft.location, error: ui.errors.location, required: true, maxlength: LIMITS.location }),
        field({ id: 'opp-work_mode', name: 'work_mode', label: 'Work mode', value: ui.draft.work_mode, options: WORK_MODES }),
      ),
      field({ id: 'opp-duration', name: 'duration', label: 'Duration (optional)', value: ui.draft.duration, error: ui.errors.duration, hint: 'For example: 12 weeks', maxlength: LIMITS.duration }),
      h('p', { id: 'authz-blocked', class: 'blocked', hidden: ui.hrAuthorized }, 'Submission is blocked: the simulated HR authorization is unchecked.'),
      h(
        'div',
        { class: 'form-actions' },
        h('button', { type: 'submit', id: 'submit-opp', class: 'btn', disabled: !ui.hrAuthorized, 'aria-describedby': 'authz-blocked' }, 'Submit for review'),
        h('button', { type: 'button', class: 'btn btn-quiet', onClick: fillSample }, 'Fill sample data'),
      ),
    );

    const statusCard = h(
      'section',
      { class: 'card stack', 'aria-labelledby': 'status-heading' },
      h('h2', { id: 'status-heading', tabindex: '-1' }, 'Opportunity status'),
      h('p', { class: 'muted' }, 'Status is read from the shared opportunity record, so the administrator’s decision shows up here.'),
      h(
        'ul',
        { class: 'status-list' },
        opportunities.map((opportunity) =>
          h(
            'li',
            { class: 'status-row' },
            h(
              'div',
              null,
              h('p', { class: 'row-title' }, opportunity.title),
              h('p', { class: 'muted' }, `${opportunity.organization_name} · ${opportunity.opportunity_id}${opportunity.origin === 'demo' ? ' · submitted in this demo' : ''}`),
              h(
                'p',
                { class: 'muted' },
                opportunity.approval_status === OPPORTUNITY_STATUS.PENDING
                  ? 'Waiting for university approval. Students cannot see it yet.'
                  : 'Approved. Visible to students.',
              ),
            ),
            approvalChip(opportunity.approval_status),
          ),
        ),
      ),
    );

    return h(
      'div',
      null,
      hero('Employer HR', 'Employer HR', 'Submit an internship opportunity for university review. New submissions start as Pending Review.'),
      h('div', { class: 'split' }, form, statusCard),
    );
  }

  function onEmployerInput(event) {
    const name = event.target.name;
    if (name && name in ui.draft) ui.draft[name] = event.target.value;
  }

  function onAuthChange(event) {
    ui.hrAuthorized = event.target.checked;
    $('#submit-opp').disabled = !ui.hrAuthorized;
    $('#authz-blocked').hidden = ui.hrAuthorized;
  }

  function fillSample() {
    ui.draft = { ...SAMPLE_DRAFT };
    ui.errors = {};
    ui.formMessage = '';
    ui.focusId = ui.hrAuthorized ? 'submit-opp' : 'hr-authorized';
    render();
  }

  function onEmployerSubmit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    ui.draft = { ...blankDraft(), ...data };
    const result = store.submitOpportunity(data, { hrAuthorized: ui.hrAuthorized });
    if (!result.ok) {
      ui.errors = result.errors || {};
      ui.formMessage = result.message;
      const firstInvalid = ['organization_name', 'title', 'description', 'location', 'duration'].find((name) => ui.errors[name]);
      ui.focusId = firstInvalid ? `opp-${firstInvalid}` : 'opp-form-error';
      render();
      return;
    }
    ui.draft = blankDraft();
    ui.errors = {};
    ui.formMessage = '';
    ui.focusId = 'status-heading';
    const created = result.opportunity;
    showToast(`${created.opportunity_id} “${created.title}” submitted. Status: ${created.approval_status}.`, {
      link: { href: '#admin', text: 'Next: review it as University Administrator →' },
    });
    // The store already re-rendered inside submitOpportunity(), before the draft was cleared above.
    render();
  }

  // ---------- University Administrator view ----------

  function adminView() {
    const pending = store.listOpportunities({ status: OPPORTUNITY_STATUS.PENDING });
    const approved = store.listOpportunities({ status: OPPORTUNITY_STATUS.APPROVED });

    const queue = pending.length
      ? h(
          'div',
          { class: 'grid-2' },
          pending.map((opportunity) =>
            h(
              'article',
              { class: 'card opp' },
              h('div', { class: 'card-top' }, h('p', { class: 'org' }, opportunity.organization_name), h('span', { class: 'idtag' }, opportunity.opportunity_id)),
              h('h3', null, opportunity.title),
              h('p', { class: 'desc' }, opportunity.description),
              h('ul', { class: 'meta' }, [opportunity.location, opportunity.work_mode, opportunity.duration].map((item) => h('li', null, item))),
              h('div', { class: 'card-top' }, approvalChip(opportunity.approval_status)),
              h(
                'button',
                { type: 'button', class: 'btn', onClick: () => approve(opportunity) },
                'Approve',
                h('span', { class: 'sr-only' }, ` ${opportunity.title} (${opportunity.opportunity_id})`),
              ),
            ),
          ),
        )
      : emptyState('The review queue is empty', 'No opportunities are waiting for review. Submissions from the Employer HR view appear here as Pending Review.');

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
                { class: 'card opp' },
                h('div', { class: 'card-top' }, h('p', { class: 'org' }, opportunity.organization_name), h('span', { class: 'idtag' }, opportunity.opportunity_id)),
                h('h3', null, opportunity.title),
                h('ul', { class: 'meta' }, [opportunity.location, opportunity.work_mode, opportunity.duration].map((item) => h('li', null, item))),
                h('div', { class: 'card-top' }, approvalChip(opportunity.approval_status)),
              ),
            ),
        )
      : emptyState('Nothing approved yet', 'Approved opportunities are listed here once published to students.');

    return h(
      'div',
      null,
      hero('University Administrator', 'University Administrator', 'Review submitted opportunities and approve them for students. Rejection and return for revision are deferred.'),
      stats(
        [
          { label: 'Pending review', value: pending.length, note: 'Waiting for your decision' },
          { label: 'Approved', value: approved.length, note: 'Visible to students' },
        ],
        true,
      ),
      h('div', { class: 'section-head' }, h('h2', { id: 'queue-heading', tabindex: '-1' }, 'Review queue')),
      queue,
      h('div', { class: 'section-head' }, h('h2', null, 'Approved opportunities')),
      approvedList,
    );
  }

  function approve(opportunity) {
    ui.focusId = 'queue-heading';
    const result = store.approveOpportunity(opportunity.opportunity_id);
    if (!result.ok) {
      showToast(result.message, { error: true });
      render();
      return;
    }
    showToast(`${opportunity.opportunity_id} “${opportunity.title}” approved. Students can now see it, and Employer HR sees the new status.`, {
      link: { href: '#student', text: 'Next: apply as Student →' },
    });
    // store.subscribe -> render()
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
                { class: 'card' },
                h('div', { class: 'card-top' }, h('h3', null, record.student.display_name), chip(record.application.application_status, 'submitted')),
                h('p', { class: 'muted' }, `${record.opportunity.title} · ${record.opportunity.organization_name}`),
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
      : emptyState('No applications yet', 'Applications submitted in the Student view appear here, linked to the same student and opportunity IDs.');

    return h(
      'div',
      null,
      hero('Faculty Reviewer', 'Faculty Reviewer', 'Inspect student application records and their statuses.', chip('Read-only', 'neutral')),
      h('p', { class: 'notice' }, 'Read-only view. Viewing an application does not approve a placement. Review decisions and placement approval are deferred.'),
      h('div', { class: 'section-head' }, h('h2', null, `Application records (${records.length})`)),
      body,
    );
  }

  // ---------- render + routing ----------

  const VIEWS = { student: studentView, employer: employerView, admin: adminView, faculty: facultyView };

  function render(options) {
    const view = $('#view');
    view.replaceChildren(VIEWS[ui.role]());
    if (ui.role === 'student') fillResults();
    $('#storage-warning').hidden = store.isPersistent();
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
    $('#role-nav').replaceChildren(
      ...ROLES.map((role) =>
        h('a', { href: `#${role.id}`, class: 'nav-item', 'data-role': role.id }, h('span', { class: 'nav-label' }, role.label), h('span', { class: 'nav-hint' }, role.hint)),
      ),
    );
  }

  function updateNav() {
    document.querySelectorAll('#role-nav a').forEach((link) => {
      if (link.dataset.role === ui.role) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const role = ROLES.find((item) => item.id === ui.role);
    document.title = `${role.label} · IPP walking skeleton demo`;
  }

  function route(initial) {
    const [roleId, tabId] = location.hash.replace(/^#\/?/, '').split('/');
    const role = ROLES.some((item) => item.id === roleId) ? roleId : 'student';
    const changed = role !== ui.role;
    ui.role = role;
    ui.tab = role === 'student' && STUDENT_TABS.some((tab) => tab.id === tabId) ? tabId : 'opportunities';
    updateNav();
    if (changed || initial) {
      if (changed) clearToast();
      render({ focusHeading: !initial });
    } else if (role === 'student') {
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
      ui.nameDraft = null;
      ui.nameError = '';
      ui.hrAuthorized = true;
      ui.dialogFocusId = 'page-title';
      resetDialog.close();
      store.reset(); // -> render()
      showToast('Demo data reset to the initial synthetic records.');
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
    store.subscribe(() => render());
    window.addEventListener('hashchange', () => route(false));
    window.addEventListener('storage', (event) => {
      if (event.key === null || event.key === Store.STORAGE_KEY) store.refresh();
    });
    route(true);
  }

  init();
})();
