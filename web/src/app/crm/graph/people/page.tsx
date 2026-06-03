import { redirect } from 'next/navigation';

// The People network is now the Orbit view at /crm/graph.
export default function PeopleGraphRedirect() {
  redirect('/crm/graph');
}
