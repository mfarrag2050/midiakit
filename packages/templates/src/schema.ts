// schema — JSON Schema draft-07 للقالب.
//
// **الاستخدام:** ينشره الحزمة كبيانات (`TEMPLATE_SCHEMA`). المتحقق في
// `validate.ts` مكتوب يدوياً (بلا Ajv) للحفاظ على شجرة تبعيات نظيفة،
// لكن الشكل مطابق لدرافت-07 فيمكن لأي مشروع خارجي تمريره إلى Ajv عند
// الحاجة.
//
// **قرار معماري:** المتحقق **يُستدعى وقت التحميل لا وقت الرندر** —
// كل قالب يمرّ بـ `loadTemplate()` مرة واحدة، ثم يعبر renderFrame
// بلا فحص. الرندر مسار حرج (60fps للفيديو).

export const TEMPLATE_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://pf-mediakit/schema/template.json',
  title: 'Template',
  type: 'object',
  required: ['id', 'name', 'kind', 'sizes', 'layers'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', pattern: '^[a-z][a-z0-9_-]*$' },
    name: { type: 'string', minLength: 1 },
    kind: { type: 'string', enum: ['static', 'video'] },
    sizes: {
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
    },
    fields: {
      type: 'array',
      items: { $ref: '#/definitions/Field' },
    },
    layers: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/definitions/Layer' },
    },
  },
  definitions: {
    Field: {
      type: 'object',
      required: ['key', 'type'],
      properties: {
        key: { type: 'string' },
        type: {
          type: 'string',
          enum: ['text', 'richtext', 'image', 'range', 'medialist'],
        },
        required: { type: 'boolean' },
        hint: { type: 'string' },
        wordRange: {
          type: 'array',
          items: { type: 'integer', minimum: 1 },
          minItems: 2,
          maxItems: 2,
        },
        min: { type: 'number' },
        max: { type: 'number' },
        default: {},
        accepts: {
          type: 'array',
          items: { type: 'string', enum: ['video', 'image'] },
        },
      },
    },
    OnlyIf: {
      type: 'string',
      enum: ['hasImage', 'isSquare', 'isPortrait'],
    },
    Layer: {
      type: 'object',
      required: ['type'],
      properties: {
        type: {
          type: 'string',
          enum: [
            'solid',
            'image',
            'gradient',
            'headline',
            'badge',
            'source',
            'logo',
            'watermark',
            'kicker',
            'accent',
          ],
        },
        onlyIf: { $ref: '#/definitions/OnlyIf' },
        fallback: {
          type: 'array',
          items: { $ref: '#/definitions/Layer' },
        },
      },
    },
  },
} as const;
