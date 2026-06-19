// Side-effect imports register each function with the @azure/functions app
// global. Order doesn't matter — each module is self-contained.
import './functions/webhooks-whatsapp';
import './functions/messages-send';
import './functions/process-inbound';
import './functions/process-outbound';
