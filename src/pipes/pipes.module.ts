import { NgModule } from '@angular/core';
import { ConvertUnitPipe } from './convert-unit/convert-unit';
import { ConvertAddressPipe } from './convert-address/convert-address';
@NgModule({
	declarations: [ConvertUnitPipe,
    ConvertAddressPipe],
	imports: [],
	exports: [ConvertUnitPipe,
    ConvertAddressPipe]
})
export class PipesModule {}
