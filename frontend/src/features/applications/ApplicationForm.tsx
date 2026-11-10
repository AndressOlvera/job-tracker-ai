import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useCreateApplication, useUpdateApplication } from '../../api/queries';
import { APPLICATION_STATUSES, STATUS_LABELS } from '../../api/status';
import type { Application, ValidationDetails } from '../../api/types';
import { useToast } from '../../components/toastContext';
import styles from './ApplicationForm.module.css';
import {
  buildCreateInput,
  buildPatch,
  changedFields,
  emptyValues,
  mapApiErrors,
  valuesFromApplication,
} from './formData';
import { fieldId } from './fieldId';
import { FormField } from './FormField';
import buttons from './listButtons.module.css';
import { NOTES_COUNTER_ID, NotesCounter } from './NotesCounter';
import { getToday } from './today';
import {
  firstInvalidField,
  validateForm,
  type FormErrors,
  type FormField as FieldName,
  type FormValues,
} from './validation';

export const FORM_TITLE_ID = 'application-form-title';
export const NO_CHANGES_MESSAGE = 'No hay cambios que guardar.';

interface ApplicationFormProps {
  /** La postulación que se edita; sin ella, el formulario crea una nueva. */
  application?: Application;
  /** A dónde volver al guardar o cancelar: la lista con sus filtros (ADR-013). */
  returnTo: string;
}

/** Lo que el formulario necesita de un `ApiError` (no se importa la clase: ADR-012). */
interface SubmitError {
  status: number | undefined;
  message: string;
  details: ValidationDetails | undefined;
}

interface GeneralError {
  /** Distinto en cada error, para que el aviso se vuelva a montar y a anunciar. */
  id: number;
  messages: string[];
  focus: boolean;
}

/**
 * Formulario de nueva postulación y de edición (docs/04-pantallas.md → 2).
 *
 * - Valida en el navegador con las reglas de la API (`validation.ts`); `noValidate` apaga la
 *   validación nativa para controlar los mensajes.
 * - `maxLength` no se pone en los campos: bloquearía la escritura sin decir por qué. Se deja
 *   escribir y se muestra el error (y el contador, en las notas).
 * - Los errores `422` de la API se muestran junto a su campo; el resto, en un aviso general.
 * - Un envío en curso bloquea los siguientes con una referencia síncrona, porque dos eventos
 *   pueden llegar antes de que React vuelva a dibujar el botón desactivado.
 */
export function ApplicationForm({ application, returnTo }: ApplicationFormProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const createMutation = useCreateApplication();
  const updateMutation = useUpdateApplication();

  // Lo cargado se fija al montar. Si la consulta se refresca en segundo plano, lo que el usuario
  // escribió no se pisa, y los cambios se comparan siempre contra lo que vio al abrir.
  const [original] = useState(application);
  const [values, setValues] = useState<FormValues>(() =>
    original ? valuesFromApplication(original) : emptyValues(getToday()),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [generalError, setGeneralError] = useState<GeneralError | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const errorCount = useRef(0);

  const isEditing = original !== undefined;
  // Se calcula en cada dibujo y en cada envío: si la página sigue abierta pasada la medianoche,
  // el `max` y la validación siguen al calendario.
  const today = getToday();

  function setField(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    // El error de un campo desaparece en cuanto se modifica.
    setErrors((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setNotice('');
  }

  function focusField(field: FieldName) {
    document.getElementById(fieldId(field))?.focus();
  }

  function showGeneralError(messages: string[], focus: boolean) {
    errorCount.current += 1;
    setGeneralError({ id: errorCount.current, messages, focus });
  }

  function handleError(error: SubmitError) {
    busyRef.current = false;
    setBusy(false);
    if (error.status === 422) {
      const { fields, general } = mapApiErrors(error.details, error.message);
      const first = firstInvalidField(fields);
      setErrors(fields);
      if (general.length > 0) showGeneralError(general, first === undefined);
      if (first) focusField(first);
      return;
    }
    // Red, 5xx, 404...: lo escrito se conserva y se puede reintentar.
    showGeneralError([error.message], true);
  }

  function handleSuccess(message: string) {
    // El botón sigue bloqueado mientras se navega: no se puede reenviar.
    toast.show(message);
    void navigate(returnTo);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;

    setGeneralError(null);
    setNotice('');

    // Al editar solo se valida lo que se va a mandar, igual que la API con un PATCH.
    const fields = original ? changedFields(values, original) : undefined;
    const found = validateForm(values, getToday(), fields);
    setErrors(found);
    const first = firstInvalidField(found);
    if (first) {
      focusField(first);
      return;
    }

    const patch = original ? buildPatch(values, original) : undefined;
    if (patch && Object.keys(patch).length === 0) {
      // Un PATCH vacío da `422`: sin cambios no hay petición.
      setNotice(NO_CHANGES_MESSAGE);
      return;
    }

    busyRef.current = true;
    setBusy(true);
    if (original && patch) {
      updateMutation.mutate(
        { id: original.id, patch },
        { onError: handleError, onSuccess: () => handleSuccess('Cambios guardados') },
      );
    } else {
      createMutation.mutate(buildCreateInput(values), {
        onError: handleError,
        onSuccess: () => handleSuccess('Postulación guardada'),
      });
    }
  }

  const submitLabel = busy ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Guardar postulación';

  return (
    <form
      className={styles.form}
      aria-labelledby={FORM_TITLE_ID}
      aria-busy={busy}
      noValidate
      onSubmit={handleSubmit}
    >
      {generalError && <GeneralAlert key={generalError.id} error={generalError} />}

      <p className={styles.requiredNote}>Los campos con * son obligatorios.</p>

      <div className={styles.grid}>
        <FormField field="company" label="Empresa" required error={errors.company}>
          {(control) => (
            <input
              {...control}
              type="text"
              required
              autoComplete="off"
              value={values.company}
              onChange={(event) => setField('company', event.target.value)}
            />
          )}
        </FormField>

        <FormField field="position" label="Puesto" required error={errors.position}>
          {(control) => (
            <input
              {...control}
              type="text"
              required
              autoComplete="off"
              value={values.position}
              onChange={(event) => setField('position', event.target.value)}
            />
          )}
        </FormField>

        <FormField field="status" label="Estado" error={errors.status}>
          {(control) => (
            <select
              {...control}
              value={values.status}
              onChange={(event) => setField('status', event.target.value)}
            >
              {APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField
          field="applied_on"
          label="Fecha de postulación"
          required
          error={errors.applied_on}
        >
          {(control) => (
            <input
              {...control}
              type="date"
              required
              max={today}
              value={values.applied_on}
              onChange={(event) => setField('applied_on', event.target.value)}
            />
          )}
        </FormField>

        <FormField field="job_url" label="Enlace de la vacante" error={errors.job_url}>
          {(control) => (
            <input
              {...control}
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              value={values.job_url}
              onChange={(event) => setField('job_url', event.target.value)}
            />
          )}
        </FormField>

        <FormField
          field="source"
          label="Fuente"
          hint="Dónde encontraste la vacante."
          error={errors.source}
        >
          {(control) => (
            <input
              {...control}
              type="text"
              autoComplete="off"
              value={values.source}
              onChange={(event) => setField('source', event.target.value)}
            />
          )}
        </FormField>

        <FormField
          field="notes"
          label="Notas"
          wide
          describedBy={[NOTES_COUNTER_ID]}
          error={errors.notes}
        >
          {(control) => (
            <>
              <textarea
                {...control}
                rows={5}
                autoComplete="off"
                value={values.notes}
                onChange={(event) => setField('notes', event.target.value)}
              />
              <NotesCounter text={values.notes} />
            </>
          )}
        </FormField>
      </div>

      {/* Siempre en el DOM para que el lector de pantalla anuncie el texto cuando aparece. */}
      <p role="status" className={styles.notice}>
        {notice}
      </p>

      <div className={styles.actions}>
        <button
          type="button"
          className={buttons.secondary}
          disabled={busy}
          onClick={() => void navigate(returnTo)}
        >
          Cancelar
        </button>
        <button type="submit" className={buttons.primary} disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Aviso de los errores que no son de un campo. Se enfoca al aparecer para que se lea y se vea. */
function GeneralAlert({ error }: { error: GeneralError }) {
  const ref = useRef<HTMLDivElement>(null);
  const { focus } = error;

  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);

  return (
    <div ref={ref} role="alert" tabIndex={-1} className={styles.alert}>
      {error.messages.length === 1 ? (
        <p>{error.messages[0]}</p>
      ) : (
        <ul>
          {error.messages.map((message, index) => (
            // El índice en la llave: la API puede repetir un mismo mensaje.
            <li key={`${index}-${message}`}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
