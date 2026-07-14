declare module "all-the-cities" {
  type WorldCity = {
    adminCode?: string;
    altName?: string;
    cityId: number;
    country: string;
    featureCode?: string;
    name: string;
    population?: number;
  };

  const cities: WorldCity[];
  export default cities;
}
