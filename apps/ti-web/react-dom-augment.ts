// TypeScript-only module augmentation for React DOM hooks used by Next.js Server Actions.
// react-dom@18.3.1 ships no TS types; we rely on @types/react-dom and augment the "react-dom"
// module to include `useFormState` / `useFormStatus`, which exist at runtime.
declare module "react-dom" {
  interface FormStatusNotPending {
    pending: false;
    data: null;
    method: null;
    action: null;
  }

  interface FormStatusPending {
    pending: true;
    data: FormData;
    method: string;
    action: string | ((formData: FormData) => void | Promise<void>);
  }

  type FormStatus = FormStatusPending | FormStatusNotPending;

  export function useFormStatus(): FormStatus;

  export function useFormState<State>(
    action: (state: Awaited<State>) => State | Promise<State>,
    initialState: Awaited<State>,
    permalink?: string
  ): [state: Awaited<State>, dispatch: () => void, isPending: boolean];

  export function useFormState<State, Payload>(
    action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
    initialState: Awaited<State>,
    permalink?: string
  ): [state: Awaited<State>, dispatch: (payload: Payload) => void, isPending: boolean];
}

export {};

