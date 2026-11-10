/*
 * IPP demo store: shared records, business rules and browser-local persistence.
 *
 * Classic script (no modules) so the demo also works when index.html is opened
 * straight from disk. It publishes `IPPStore` on globalThis; tests import it in Node.
 *
 * Everything here is synthetic demo data. Role switching and HR authorization are
 * simulated in the UI; nothing in this file is production access control.
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'ipp-demo-v1';
  const SCHEMA_VERSION = 1;
  const ACTIVITY_LIMIT = 60;

  const OPPORTUNITY_STATUS = Object.freeze({ PENDING: 'Pending Review', APPROVED: 'Approved' });
  const APPLICATION_STATUS = Object.freeze({ SUBMITTED: 'Submitted' });
  // Placement is a separate concept from application status. Placement decisions are
  // deferred (IPP-22), so every application shows this constant and never changes it.
  const PLACEMENT_STATUS = 'Not placed';
  const REVIEW_STATUS = Object.freeze({ NOT_STARTED: 'Not started' });
  const WORK_MODES = Object.freeze(['On-site', 'Hybrid', 'Remote']);

  const LIMITS = Object.freeze({
    organization_name: 80,
    title: 100,
    location: 80,
    description: 600,
    duration: 40,
    display_name: 60,
  });

  const FIELD_LABELS = Object.freeze({
    organization_name: 'Organization name',
    title: 'Title',
    description: 'Description',
    location: 'Location',
    display_name: 'Display name',
  });

  const REQUIRED_OPPORTUNITY_FIELDS = Object.freeze(['organization_name', 'title', 'description', 'location']);

  function seedState() {
    return {
      version: SCHEMA_VERSION,
      employers: [
        { employer_id: 'EMP-001', organization_name: 'Evergreen Labs', hr_user_id: 'HR-001', hr_authorized: true },
        { employer_id: 'EMP-002', organization_name: 'Northstar Analytics', hr_user_id: 'HR-002', hr_authorized: true },
      ],
      opportunities: [
        {
          opportunity_id: 'OPP-001',
          employer_id: 'EMP-001',
          title: 'Product Design Intern',
          description:
            'Work with the design team on user research and interface prototypes for a sustainability dashboard.',
          location: 'Abu Dhabi',
          work_mode: 'Hybrid',
          duration: '12 weeks',
          approval_status: OPPORTUNITY_STATUS.APPROVED,
          origin: 'sample',
        },
        {
          opportunity_id: 'OPP-002',
          employer_id: 'EMP-002',
          title: 'Data Analytics Intern',
          description: 'Clean, analyse and visualise operational data sets and present findings to product managers.',
          location: 'Dubai',
          work_mode: 'On-site',
          duration: '10 weeks',
          approval_status: OPPORTUNITY_STATUS.APPROVED,
          origin: 'sample',
        },
      ],
      students: [{ student_id: 'STU-001', display_name: 'Alex Lee', eligibility_status: 'Eligible' }],
      faculty: [{ faculty_id: 'FAC-001', display_name: 'Dr. Sam Okafor' }],
      applications: [],
      reviews: [],
      activity: [],
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function nextId(prefix, records, key) {
    let max = 0;
    for (const record of records) {
      const match = /-(\d+)$/.exec(String(record[key]));
      if (match) max = Math.max(max, Number(match[1]));
    }
    return `${prefix}-${String(max + 1).padStart(3, '0')}`;
  }

  function isValidState(value) {
    return (
      value &&
      typeof value === 'object' &&
      value.version === SCHEMA_VERSION &&
      ['employers', 'opportunities', 'students', 'faculty', 'applications', 'reviews'].every((key) =>
        Array.isArray(value[key]),
      ) &&
      value.students.length > 0 &&
      value.faculty.length > 0
    );
  }

  /** Wraps window.localStorage; returns null if the browser blocks it (private mode, etc.). */
  function browserStorage() {
    try {
      const storage = root.localStorage;
      const probe = '__ipp_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch (error) {
      return null;
    }
  }

  function createStore(storage) {
    const listeners = new Set();
    let persistent = Boolean(storage);
    let state = load();

    function load() {
      if (storage) {
        try {
          const raw = storage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (isValidState(parsed)) {
              // `activity` was added after v1 first shipped; tolerate records saved without it.
              if (!Array.isArray(parsed.activity)) parsed.activity = [];
              return parsed;
            }
          }
        } catch (error) {
          /* corrupted or unreadable: fall through to a fresh seed */
        }
      }
      return seedState();
    }

    function save() {
      if (storage) {
        try {
          storage.setItem(STORAGE_KEY, JSON.stringify(state));
          persistent = true;
        } catch (error) {
          persistent = false; // quota or privacy mode: keep working in memory
        }
      }
      for (const listener of listeners) listener();
    }

    /** Re-read from storage, e.g. after another tab changed the records. */
    function refresh() {
      state = load();
      for (const listener of listeners) listener();
    }

    function fail(code, message, extra) {
      return Object.assign({ ok: false, code, message }, extra);
    }

    /** Append to the activity feed shown in the UI (newest last, capped so storage stays small). */
    function log(role, kind, text, ref) {
      state.activity.push({
        activity_id: nextId('ACT', state.activity, 'activity_id'),
        at: new Date().toISOString(),
        role,
        kind,
        text,
        ref: ref || '',
      });
      if (state.activity.length > ACTIVITY_LIMIT) state.activity.splice(0, state.activity.length - ACTIVITY_LIMIT);
    }

    function submitOpportunity(input, options) {
      const hrAuthorized = Boolean(options && options.hrAuthorized);
      if (!hrAuthorized) {
        return fail(
          'unauthorized',
          'Submission blocked: only an authorized HR representative can submit opportunities. (Simulated control; real authorization is deferred.)',
        );
      }

      const values = {
        organization_name: String(input.organization_name ?? '').trim(),
        title: String(input.title ?? '').trim(),
        description: String(input.description ?? '').trim(),
        location: String(input.location ?? '').trim(),
        duration: String(input.duration ?? '').trim(),
        work_mode: WORK_MODES.includes(input.work_mode) ? input.work_mode : 'Hybrid',
      };

      const errors = {};
      for (const field of REQUIRED_OPPORTUNITY_FIELDS) {
        if (!values[field]) errors[field] = `${FIELD_LABELS[field]} is required.`;
      }
      for (const field of ['organization_name', 'title', 'description', 'location', 'duration']) {
        if (!errors[field] && values[field].length > LIMITS[field]) {
          errors[field] = `${FIELD_LABELS[field] || 'Duration'} must be ${LIMITS[field]} characters or fewer.`;
        }
      }
      if (Object.keys(errors).length > 0) {
        return fail('validation', 'Fix the highlighted fields and submit again.', { errors });
      }

      let employer = state.employers.find(
        (candidate) => candidate.organization_name.toLowerCase() === values.organization_name.toLowerCase(),
      );
      if (!employer) {
        employer = {
          employer_id: nextId('EMP', state.employers, 'employer_id'),
          organization_name: values.organization_name,
          hr_user_id: nextId('HR', state.employers, 'hr_user_id'),
          hr_authorized: true,
        };
        state.employers.push(employer);
      }

      const opportunity = {
        opportunity_id: nextId('OPP', state.opportunities, 'opportunity_id'),
        employer_id: employer.employer_id,
        title: values.title,
        description: values.description,
        location: values.location,
        work_mode: values.work_mode,
        duration: values.duration || 'Not specified',
        approval_status: OPPORTUNITY_STATUS.PENDING,
        origin: 'demo',
      };
      state.opportunities.push(opportunity);
      log('employer', 'opportunity_submitted', `Employer HR submitted “${opportunity.title}” for review`, opportunity.opportunity_id);
      save();
      return { ok: true, opportunity: clone(opportunity) };
    }

    function approveOpportunity(opportunityId) {
      const opportunity = state.opportunities.find((candidate) => candidate.opportunity_id === opportunityId);
      if (!opportunity) return fail('not_found', `Opportunity ${opportunityId} does not exist.`);
      if (opportunity.approval_status === OPPORTUNITY_STATUS.APPROVED) {
        return fail('already_approved', `${opportunityId} is already approved.`);
      }
      opportunity.approval_status = OPPORTUNITY_STATUS.APPROVED;
      log('admin', 'opportunity_approved', `Administrator approved “${opportunity.title}”`, opportunity.opportunity_id);
      save();
      return { ok: true, opportunity: clone(opportunity) };
    }

    function hasApplied(studentId, opportunityId) {
      return state.applications.some(
        (application) => application.student_id === studentId && application.opportunity_id === opportunityId,
      );
    }

    function submitApplication(studentId, opportunityId) {
      const student = state.students.find((candidate) => candidate.student_id === studentId);
      if (!student) return fail('not_found', `Student ${studentId} does not exist.`);
      const opportunity = state.opportunities.find((candidate) => candidate.opportunity_id === opportunityId);
      if (!opportunity) return fail('not_found', `Opportunity ${opportunityId} does not exist.`);
      if (opportunity.approval_status !== OPPORTUNITY_STATUS.APPROVED) {
        return fail('not_approved', 'Only Approved opportunities accept applications.');
      }
      if (hasApplied(studentId, opportunityId)) {
        return fail('duplicate', 'You have already applied to this opportunity.');
      }

      const application = {
        application_id: nextId('APP', state.applications, 'application_id'),
        opportunity_id: opportunityId,
        student_id: studentId,
        application_status: APPLICATION_STATUS.SUBMITTED,
        submitted_at: new Date().toISOString(),
      };
      const review = {
        review_id: nextId('REV', state.reviews, 'review_id'),
        application_id: application.application_id,
        faculty_id: state.faculty[0].faculty_id,
        review_status: REVIEW_STATUS.NOT_STARTED,
      };
      state.applications.push(application);
      state.reviews.push(review);
      log('student', 'application_submitted', `${student.display_name} applied to “${opportunity.title}”`, application.application_id);
      save();
      return { ok: true, application: clone(application), review: clone(review) };
    }

    function updateDisplayName(studentId, displayName) {
      const student = state.students.find((candidate) => candidate.student_id === studentId);
      if (!student) return fail('not_found', `Student ${studentId} does not exist.`);
      const name = String(displayName ?? '').trim();
      if (!name) return fail('validation', 'Display name is required.', { errors: { display_name: 'Display name is required.' } });
      if (name.length > LIMITS.display_name) {
        const message = `Display name must be ${LIMITS.display_name} characters or fewer.`;
        return fail('validation', message, { errors: { display_name: message } });
      }
      if (student.display_name !== name) {
        log('student', 'profile_updated', `Student display name changed to “${name}”`, student.student_id);
      }
      student.display_name = name;
      save();
      return { ok: true, student: clone(student) };
    }

    function reset() {
      state = seedState();
      log('system', 'demo_reset', 'Demo data reset to the sample records', '');
      save();
    }

    // ---- read-side helpers (always return copies so the UI cannot mutate shared records) ----

    function employerName(employerId) {
      const employer = state.employers.find((candidate) => candidate.employer_id === employerId);
      return employer ? employer.organization_name : 'Unknown organization';
    }

    function withOrganization(opportunity) {
      return Object.assign(clone(opportunity), { organization_name: employerName(opportunity.employer_id) });
    }

    function listOpportunities(filter) {
      return state.opportunities
        .filter((opportunity) => !filter || !filter.status || opportunity.approval_status === filter.status)
        .map(withOrganization);
    }

    /**
     * Approved opportunities matching a title/organization query.
     * options.workMode narrows to one work mode; options.sort is 'newest' or 'title'
     * (omitted = insertion order).
     */
    function searchApproved(query, options) {
      const opts = options || {};
      const needle = String(query ?? '').trim().toLowerCase();
      let list = listOpportunities({ status: OPPORTUNITY_STATUS.APPROVED }).filter(
        (opportunity) =>
          !needle ||
          opportunity.title.toLowerCase().includes(needle) ||
          opportunity.organization_name.toLowerCase().includes(needle),
      );
      if (WORK_MODES.includes(opts.workMode)) list = list.filter((opportunity) => opportunity.work_mode === opts.workMode);
      if (opts.sort === 'newest') list.reverse();
      else if (opts.sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
      return list;
    }

    function getFaculty() {
      return clone(state.faculty[0]);
    }

    /** Newest first. */
    function listActivity(limit) {
      return state.activity
        .slice()
        .reverse()
        .slice(0, limit || ACTIVITY_LIMIT)
        .map(clone);
    }

    /**
     * Progress of the most recent opportunity submitted in this demo through the four hand-offs.
     * `placement_status` is reported separately because applying never implies a placement.
     */
    function getJourney() {
      const tracked = state.opportunities.slice().reverse().find((opportunity) => opportunity.origin === 'demo') || null;
      const application = tracked ? state.applications.find((item) => item.opportunity_id === tracked.opportunity_id) : null;
      const reviewed = Boolean(application && state.reviews.some((review) => review.application_id === application.application_id));
      const stages = [
        { key: 'submitted', role: 'employer', label: 'Submitted by Employer HR', done: Boolean(tracked) },
        { key: 'approved', role: 'admin', label: 'Approved by Administrator', done: Boolean(tracked && tracked.approval_status === OPPORTUNITY_STATUS.APPROVED) },
        { key: 'applied', role: 'student', label: 'Student applied', done: Boolean(application) },
        { key: 'visible', role: 'faculty', label: 'Visible to Employer HR and Faculty', done: reviewed },
      ];
      return {
        opportunity: tracked ? withOrganization(tracked) : null,
        application: application ? clone(application) : null,
        stages,
        complete: stages.every((stage) => stage.done),
        placement_status: PLACEMENT_STATUS,
      };
    }

    function getStudent(studentId) {
      const student = state.students.find((candidate) => candidate.student_id === studentId);
      return student ? clone(student) : null;
    }

    function listStudentApplications(studentId) {
      return state.applications
        .filter((application) => application.student_id === studentId)
        .map((application) => {
          const opportunity = state.opportunities.find((candidate) => candidate.opportunity_id === application.opportunity_id);
          const review = state.reviews.find((candidate) => candidate.application_id === application.application_id);
          return Object.assign(clone(application), {
            opportunity: withOrganization(opportunity),
            review: review ? clone(review) : null,
            placement_status: PLACEMENT_STATUS,
          });
        });
    }

    /** Faculty view: each application joined to its student, opportunity and review record. */
    function listFacultyRecords() {
      return state.applications.map((application) => {
        const opportunity = state.opportunities.find((candidate) => candidate.opportunity_id === application.opportunity_id);
        const student = state.students.find((candidate) => candidate.student_id === application.student_id);
        const review = state.reviews.find((candidate) => candidate.application_id === application.application_id);
        return {
          application: clone(application),
          opportunity: withOrganization(opportunity),
          student: clone(student),
          review: clone(review),
          placement_status: PLACEMENT_STATUS,
        };
      });
    }

    /**
     * Employer HR view: applications received, newest first.
     * Deliberately a narrower projection than the faculty view: no review records, and only the
     * student fields an employer needs to recognise an applicant (what employers may see about a
     * student in a real system is a privacy decision that is still open).
     */
    function listEmployerApplications() {
      return state.applications
        .slice()
        .reverse()
        .map((application) => {
          const opportunity = state.opportunities.find((candidate) => candidate.opportunity_id === application.opportunity_id);
          const student = state.students.find((candidate) => candidate.student_id === application.student_id);
          return {
            application: clone(application),
            opportunity: withOrganization(opportunity),
            student: {
              student_id: student.student_id,
              display_name: student.display_name,
              eligibility_status: student.eligibility_status,
            },
            placement_status: PLACEMENT_STATUS,
          };
        });
    }

    /** Number of applications received per opportunity ID, e.g. { 'OPP-003': 1 }. */
    function applicantCounts() {
      const byOpportunity = {};
      for (const application of state.applications) {
        byOpportunity[application.opportunity_id] = (byOpportunity[application.opportunity_id] || 0) + 1;
      }
      return byOpportunity;
    }

    function counts() {
      return {
        pending: state.opportunities.filter((o) => o.approval_status === OPPORTUNITY_STATUS.PENDING).length,
        approved: state.opportunities.filter((o) => o.approval_status === OPPORTUNITY_STATUS.APPROVED).length,
        applications: state.applications.length,
      };
    }

    return {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      isPersistent: () => persistent,
      refresh,
      reset,
      submitOpportunity,
      approveOpportunity,
      submitApplication,
      updateDisplayName,
      hasApplied,
      listOpportunities,
      searchApproved,
      getFaculty,
      listActivity,
      getJourney,
      getStudent,
      listStudentApplications,
      listFacultyRecords,
      listEmployerApplications,
      applicantCounts,
      counts,
      getApplicationFor: (studentId, opportunityId) => {
        const found = state.applications.find((a) => a.student_id === studentId && a.opportunity_id === opportunityId);
        return found ? clone(found) : null;
      },
    };
  }

  root.IPPStore = Object.freeze({
    STORAGE_KEY,
    OPPORTUNITY_STATUS,
    APPLICATION_STATUS,
    PLACEMENT_STATUS,
    REVIEW_STATUS,
    WORK_MODES,
    LIMITS,
    seedState,
    createStore,
    browserStorage,
  });
})(globalThis);
