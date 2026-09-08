import { describe, expect, it } from 'vitest';
import { validateCmsDataSchema, validateEntryDataAgainstSchema } from './content.service.js';

const optionalSelectSchema = {
  version: 1,
  fields: [{
    key: 'flavor',
    label: 'Flavor',
    type: 'select',
    required: false,
    options: [
      { label: 'Vanilla', value: 'vanilla' },
      { label: 'Chocolate', value: 'chocolate' },
    ],
  }],
};

describe('CMS field contracts', () => {
  it('accepts omitted and valid optional select values but rejects an invalid provided value', () => {
    const parsed = validateCmsDataSchema(optionalSelectSchema);
    expect(parsed.valid).toBe(true);
    expect(validateEntryDataAgainstSchema({}, parsed.dataSchema!).valid).toBe(true);
    expect(validateEntryDataAgainstSchema({ flavor: 'vanilla' }, parsed.dataSchema!).valid).toBe(true);
    expect(validateEntryDataAgainstSchema({ flavor: 'strawberry' }, parsed.dataSchema!)).toMatchObject({ valid: false });
  });

  it.each([
    ['unknown field type', { version: 1, fields: [{ key: 'asset', label: 'Asset', type: 'media' }] }, 'Unsupported field type'],
    ['duplicate field key', { version: 1, fields: [{ key: 'title', label: 'A', type: 'text' }, { key: 'title', label: 'B', type: 'text' }] }, 'Duplicate field key'],
    ['invalid string range', { version: 1, fields: [{ key: 'title', label: 'Title', type: 'text', minLength: 5, maxLength: 2 }] }, 'minLength cannot be greater'],
    ['invalid number range', { version: 1, fields: [{ key: 'score', label: 'Score', type: 'number', min: 10, max: 2 }] }, 'min cannot be greater'],
    ['duplicate select option value', { version: 1, fields: [{ key: 'state', label: 'State', type: 'select', options: [{ label: 'A', value: 'x' }, { label: 'B', value: 'x' }] }] }, 'Duplicate option value'],
    ['unsupported property', { version: 1, fields: [{ key: 'title', label: 'Title', type: 'text', maxLenght: 20 }] }, 'Unsupported schema property'],
    ['invalid number default', { version: 1, fields: [{ key: 'count', label: 'Count', type: 'number', default: 'abc' }] }, 'default must be a number'],
    ['invalid boolean default', { version: 1, fields: [{ key: 'enabled', label: 'Enabled', type: 'boolean', default: 'yes' }] }, 'default must be a boolean'],
    ['invalid select default', { version: 1, fields: [{ key: 'state', label: 'State', type: 'select', default: 'z', options: [{ label: 'A', value: 'a' }] }] }, 'not in allowed select options'],
    ['invalid text default length', { version: 1, fields: [{ key: 'code', label: 'Code', type: 'text', maxLength: 3, default: 'long' }] }, 'default length must be <= maxLength'],
    ['fractional schema version', { version: 1.5, fields: [] }, 'positive integer'],
    ['non-boolean required', { version: 1, fields: [{ key: 'title', label: 'Title', type: 'text', required: 'false' }] }, 'required must be a boolean'],
    ['non-boolean integerOnly', { version: 1, fields: [{ key: 'count', label: 'Count', type: 'number', integerOnly: 'yes' }] }, 'integerOnly must be a boolean'],
    ['text-only constraint on number', { version: 1, fields: [{ key: 'count', label: 'Count', type: 'number', minLength: 1 }] }, 'not supported for type "number"'],
    ['number-only constraint on text', { version: 1, fields: [{ key: 'title', label: 'Title', type: 'text', min: 1 }] }, 'not supported for type "text"'],
    ['unsupported select option property', { version: 1, fields: [{ key: 'state', label: 'State', type: 'select', options: [{ label: 'A', value: 'a', lable: 'typo' }] }] }, 'Unsupported option property'],
    ['unsupported top-level property', { version: 1, fields: [], fieldz: [] }, 'Unsupported top-level schema property'],
    ['null text default', { version: 1, fields: [{ key: 'title', label: 'Title', type: 'text', default: null }] }, 'default must be a string'],
    ['fractional minLength', { version: 1, fields: [{ key: 'title', label: 'Title', type: 'text', minLength: 1.5 }] }, 'non-negative integer'],
  ])('rejects %s', (_name, schema, message) => {
    expect(validateCmsDataSchema(schema)).toMatchObject({ valid: false, error: expect.stringContaining(message) });
  });
});
