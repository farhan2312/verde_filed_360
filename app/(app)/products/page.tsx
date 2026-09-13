import { notFound } from "next/navigation";
import { getRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canAccess } from "@/lib/roles";
import { listProducts, getProductFacets, type ProductFacets } from "@/app/actions/products";
import { ProductCatalog, type CatalogKpis } from "@/components/products/ProductCatalog";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const role = await getRole();
  if (!canAccess("products", role)) notFound();

  const canEdit = role === "central" || role === "sysadmin";
  let initial = { rows: [], total: 0, page: 1, pageSize: 50 } as Awaited<ReturnType<typeof listProducts>>;
  let facets: ProductFacets = { mainCategories: [], subCategories: [], cropTags: [], uoms: [], targetCrops: [], targetPests: [] };
  let kpis: CatalogKpis = { products: 0, revenue: 0, qty: 0, categories: 0 };

  try {
    const [list, fac, agg, cats] = await Promise.all([
      listProducts({ sort: "revenue", page: 1, pageSize: 50 }),
      getProductFacets(),
      prisma.product.aggregate({ where: { active: true, mergedIntoId: null }, _sum: { totalRevenue: true, totalQty: true }, _count: { _all: true } }),
      prisma.product.findMany({ where: { mainCategory: { not: null }, active: true }, distinct: ["mainCategory"], select: { mainCategory: true } }),
    ]);
    initial = list;
    facets = fac;
    kpis = { products: agg._count._all, revenue: agg._sum.totalRevenue ?? 0, qty: agg._sum.totalQty ?? 0, categories: cats.length };
  } catch {
    // DB unavailable — render empty shell.
  }

  return <ProductCatalog initial={initial} facets={facets} kpis={kpis} canEdit={canEdit} />;
}
