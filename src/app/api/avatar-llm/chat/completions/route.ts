// Some OpenAI-compatible clients append /v1 themselves; support both base forms.
export const runtime='nodejs';
export const dynamic='force-dynamic';
export {POST} from '../../v1/chat/completions/route';
