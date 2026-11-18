import { PageTitle } from "@/components/ui";
import { NewCustomerForm } from "./form";

export default function NovoClientePage() {
  return (
    <div className="max-w-lg">
      <PageTitle title="Novo cliente" subtitle="Se o CPF já existir, o cadastro é reutilizado e vinculado à sua carteira sem expor dados de outros agentes." />
      <div className="card p-5"><NewCustomerForm /></div>
    </div>
  );
}
