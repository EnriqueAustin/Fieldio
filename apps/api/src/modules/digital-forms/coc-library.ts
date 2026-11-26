import type { TemplateSchema } from './form-schema';

/**
 * Starter "record" templates for South African electricians and plumbers.
 *
 * These are the company's own compliance RECORDS: they capture the inspection,
 * test results and evidence behind a certificate, and carry the official
 * certificate serial number as a field. They are not, and must never be
 * presented as, the government-issued / PIRB-issued certificate itself.
 */
export interface LibraryTemplate {
    key: string;
    name: string;
    description: string;
    trade: 'electrical' | 'plumbing';
    schema: TemplateSchema;
}

const ELECTRICAL_DECLARATION =
    'I, the registered person named above, declare that the electrical installation described in this record ' +
    'has been inspected and tested in accordance with SANS 10142-1 and the Electrical Installation Regulations, ' +
    'and that the results recorded here are a true reflection of the installation at the time of testing. ' +
    'The official Certificate of Compliance is issued under the serial number recorded above.';

const PLUMBING_DECLARATION =
    'I, the plumber named above, declare that the hot water installation described in this record has been ' +
    'installed and inspected in accordance with SANS 10254, SANS 10252-1 and the applicable municipal by-laws. ' +
    'The PIRB Certificate of Compliance for this work is issued under the number recorded above.';

const PASS_FAIL_NOTE = 'Pass / Fail / N/A';

export const COC_LIBRARY: LibraryTemplate[] = [
    {
        key: 'electrical-coc-record',
        trade: 'electrical',
        name: 'Electrical CoC record (SANS 10142-1)',
        description:
            'Inspection and test record behind an electrical Certificate of Compliance: installation, DB board, ' +
            'per-circuit test results, earthing, photos and the registered person’s declaration.',
        schema: {
            kind: 'record',
            libraryKey: 'electrical-coc-record',
            requiresCoc: true,
            customerFacing: true,
            certificateTitle: 'Electrical Installation — Certificate of Compliance Record',
            fields: [
                { key: 'section_installation', type: 'section', label: 'Installation' },
                { key: 'coc_number', type: 'text', label: 'Official CoC serial number', required: true, role: 'certificateNumber', help: 'The serial number printed on the official Certificate of Compliance.' },
                { key: 'certificate_reason', type: 'select', label: 'Reason for certificate', required: true, options: ['New installation', 'Addition / alteration', 'Change of ownership (sale)', 'Periodic inspection', 'Other'] },
                { key: 'installation_type', type: 'select', label: 'Type of installation', required: true, options: ['Domestic', 'Commercial', 'Industrial', 'Agricultural', 'Other'] },
                { key: 'supply_type', type: 'select', label: 'Supply', required: true, options: ['Single phase', 'Three phase'] },
                { key: 'erf_number', type: 'text', label: 'Erf / stand number' },
                { key: 'work_description', type: 'textarea', label: 'Description of the installation / work covered', required: true },

                { key: 'section_registered_person', type: 'section', label: 'Registered person' },
                { key: 'registered_person', type: 'text', label: 'Registered person name', required: true, role: 'registeredPerson' },
                { key: 'registration_category', type: 'select', label: 'Registration category', required: true, role: 'registrationCategory', options: ['Electrical Tester for Single Phase', 'Installation Electrician', 'Master Installation Electrician'] },
                { key: 'registration_number', type: 'text', label: 'Registration number', required: true, role: 'registrationNumber' },

                { key: 'section_db', type: 'section', label: 'Distribution board' },
                { key: 'db_location', type: 'text', label: 'DB board location', required: true },
                { key: 'db_main_switch_rating', type: 'number', label: 'Main switch rating', unit: 'A', required: true },
                { key: 'db_earth_leakage_rating', type: 'number', label: 'Earth leakage rated trip current', unit: 'mA' },
                { key: 'supply_voltage', type: 'number', label: 'Supply voltage', unit: 'V' },
                { key: 'db_circuits_labelled', type: 'passfail', label: 'Circuits correctly labelled', required: true, help: PASS_FAIL_NOTE },
                { key: 'db_enclosure_condition', type: 'passfail', label: 'Board, cover and enclosure in good condition', required: true, help: PASS_FAIL_NOTE },

                {
                    key: 'test_results',
                    type: 'table',
                    label: 'Test results per circuit',
                    required: true,
                    minRows: 1,
                    columns: [
                        { key: 'circuit_no', label: 'Circuit', type: 'text', required: true },
                        { key: 'description', label: 'Description', type: 'text' },
                        { key: 'device_rating', label: 'Protective device', type: 'number', unit: 'A' },
                        { key: 'insulation_resistance', label: 'Insulation resistance', type: 'number', unit: 'MΩ' },
                        { key: 'earth_continuity', label: 'Earth continuity', type: 'number', unit: 'Ω' },
                        { key: 'loop_impedance', label: 'Earth loop impedance', type: 'number', unit: 'Ω' },
                        { key: 'rcd_trip_time', label: 'RCD trip time', type: 'number', unit: 'ms' },
                        { key: 'rcd_trip_current', label: 'RCD trip current', type: 'number', unit: 'mA' },
                        { key: 'result', label: 'Result', type: 'passfail', required: true },
                    ],
                },

                { key: 'section_earthing', type: 'section', label: 'Earth leakage, earthing and bonding' },
                { key: 'elu_test_button', type: 'passfail', label: 'Earth leakage unit trips on its test button', required: true, help: PASS_FAIL_NOTE },
                { key: 'elu_trip_time', type: 'number', label: 'Earth leakage unit trip time', unit: 'ms' },
                { key: 'elu_trip_current', type: 'number', label: 'Earth leakage unit trip current', unit: 'mA' },
                { key: 'earth_spike', type: 'passfail', label: 'Earth electrode / spike installed and connected', required: true, help: PASS_FAIL_NOTE },
                { key: 'earth_electrode_resistance', type: 'number', label: 'Earth electrode resistance', unit: 'Ω' },
                { key: 'main_bonding', type: 'passfail', label: 'Main equipotential bonding (water, gas, metal structures)', required: true, help: PASS_FAIL_NOTE },
                { key: 'polarity_correct', type: 'passfail', label: 'Polarity correct', required: true, help: PASS_FAIL_NOTE },

                { key: 'section_photos', type: 'section', label: 'Photos' },
                { key: 'photos_db_before', type: 'photo', label: 'DB board — before', required: true, minCount: 1, maxCount: 4 },
                { key: 'photos_db_after', type: 'photo', label: 'DB board — after', required: true, minCount: 1, maxCount: 4 },
                { key: 'remarks', type: 'textarea', label: 'Remarks / defects noted' },

                { key: 'section_declaration', type: 'section', label: 'Declaration', help: ELECTRICAL_DECLARATION },
                { key: 'declaration_confirmed', type: 'checkbox', label: 'I confirm the declaration above', required: true },
                { key: 'test_date', type: 'date', label: 'Date of test', required: true },
                { key: 'signature', type: 'signature', label: 'Registered person signature', required: true },
            ],
        },
    },
    {
        key: 'plumbing-geyser-coc-record',
        trade: 'plumbing',
        name: 'Plumbing CoC record — hot water / geyser (PIRB)',
        description:
            'Installation record behind a PIRB plumbing Certificate of Compliance for a hot water system: geyser ' +
            'details, safety-valve checklist, required photos and the plumber’s declaration.',
        schema: {
            kind: 'record',
            libraryKey: 'plumbing-geyser-coc-record',
            requiresCoc: true,
            customerFacing: true,
            certificateTitle: 'Hot Water Installation — Plumbing Certificate of Compliance Record',
            fields: [
                { key: 'section_installation', type: 'section', label: 'Installation' },
                { key: 'coc_number', type: 'text', label: 'PIRB CoC number', required: true, role: 'certificateNumber', help: 'The number of the official PIRB Certificate of Compliance.' },
                { key: 'installation_type', type: 'select', label: 'Type of work', required: true, options: ['New installation', 'Replacement', 'Repair / maintenance'] },
                { key: 'work_description', type: 'textarea', label: 'Description of work', required: true },

                { key: 'section_geyser', type: 'section', label: 'Geyser' },
                { key: 'geyser_make', type: 'text', label: 'Make', required: true },
                { key: 'geyser_model', type: 'text', label: 'Model', required: true },
                { key: 'geyser_serial', type: 'text', label: 'Serial number', required: true },
                { key: 'geyser_capacity', type: 'number', label: 'Capacity', unit: 'L', required: true },
                { key: 'energy_source', type: 'select', label: 'Energy source', required: true, options: ['Electric', 'Gas', 'Solar — direct', 'Solar — indirect', 'Heat pump'] },
                { key: 'geyser_orientation', type: 'select', label: 'Orientation', options: ['Horizontal', 'Vertical'] },
                { key: 'working_pressure', type: 'number', label: 'Rated working pressure', unit: 'kPa' },
                { key: 'geyser_location', type: 'text', label: 'Location (e.g. roof space, outside wall)' },

                { key: 'section_checklist', type: 'section', label: 'Safety checklist' },
                { key: 'pressure_control_valve', type: 'passfail', label: 'Pressure control valve fitted at the correct rating', required: true, help: PASS_FAIL_NOTE },
                { key: 'tp_valve', type: 'passfail', label: 'Temperature & pressure (T&P) relief valve fitted, discharging safely', required: true, help: PASS_FAIL_NOTE },
                { key: 'vacuum_breakers', type: 'passfail', label: 'Vacuum breakers fitted (hot and cold sides)', required: true, help: PASS_FAIL_NOTE },
                { key: 'drip_tray', type: 'passfail', label: 'Drip tray fitted with drain to outside', required: true, help: PASS_FAIL_NOTE },
                { key: 'isolating_valve', type: 'passfail', label: 'Isolating valve on the cold supply', required: true, help: PASS_FAIL_NOTE },
                { key: 'thermostat', type: 'passfail', label: 'Thermostat operating and set correctly', required: true, help: PASS_FAIL_NOTE },
                { key: 'overflow_terminated', type: 'passfail', label: 'Overflow / discharge pipes terminated safely outside', required: true, help: PASS_FAIL_NOTE },

                { key: 'section_photos', type: 'section', label: 'Required photos' },
                { key: 'photo_rating_plate', type: 'photo', label: 'Geyser rating plate', required: true, minCount: 1, maxCount: 2 },
                { key: 'photo_pressure_control_valve', type: 'photo', label: 'Pressure control valve', required: true, minCount: 1, maxCount: 2 },
                { key: 'photo_drip_tray', type: 'photo', label: 'Drip tray', required: true, minCount: 1, maxCount: 2 },
                { key: 'photo_tp_valve', type: 'photo', label: 'T&P valve', required: true, minCount: 1, maxCount: 2 },
                { key: 'photo_vacuum_breakers', type: 'photo', label: 'Vacuum breakers / overflow', required: true, minCount: 1, maxCount: 3 },

                { key: 'section_plumber', type: 'section', label: 'Plumber' },
                { key: 'plumber_name', type: 'text', label: 'Plumber name', required: true, role: 'registeredPerson' },
                { key: 'pirb_registration_number', type: 'text', label: 'PIRB registration number', required: true, role: 'registrationNumber' },
                { key: 'pirb_category', type: 'select', label: 'PIRB registration category', role: 'registrationCategory', options: ['Licensed Plumber', 'Master Plumber', 'Other'] },
                { key: 'remarks', type: 'textarea', label: 'Remarks' },

                { key: 'section_declaration', type: 'section', label: 'Declaration', help: PLUMBING_DECLARATION },
                { key: 'declaration_confirmed', type: 'checkbox', label: 'I confirm the declaration above', required: true },
                { key: 'completion_date', type: 'date', label: 'Date of completion', required: true },
                { key: 'signature', type: 'signature', label: 'Plumber signature', required: true },
            ],
        },
    },
];

export function findLibraryTemplate(key: string): LibraryTemplate | undefined {
    return COC_LIBRARY.find((t) => t.key === key);
}
