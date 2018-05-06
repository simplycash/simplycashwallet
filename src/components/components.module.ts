import { NgModule } from '@angular/core';
import { MyAmountComponent } from './my-amount/my-amount';
import { IonicPageModule } from 'ionic-angular';

@NgModule({
	declarations: [
    MyAmountComponent
	],
	imports: [
		IonicPageModule,
	],
	exports: [
    MyAmountComponent
	]
})
export class ComponentsModule {}
