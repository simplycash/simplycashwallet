import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { MyAmountComponent } from './my-amount/my-amount';
import { IonicPageModule } from 'ionic-angular';

@NgModule({
	declarations: [
    MyAmountComponent
	],
	imports: [
		IonicPageModule,
		TranslateModule.forChild(),
	],
	exports: [
    MyAmountComponent
	]
})
export class ComponentsModule {}
